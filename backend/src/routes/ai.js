const express = require('express');
const { z } = require('zod');
const { query, queryOne } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { aiLimiter } = require('../middleware/rateLimit');
const { ok, wrap, notFound, badRequest } = require('../utils/response');
const aiService = require('../services/aiService');
const weatherService = require('../services/weatherService');
const farmerService = require('../services/farmerService');
const notifications = require('../services/notificationService');
const chatService = require('../services/chatService');

const router = express.Router();
router.use(authenticate);

router.get('/status', (_req, res) => ok(res, { aiConfigured: aiService.isConfigured(), disclaimer: aiService.DISCLAIMER }));

async function optionalWeather(profile) {
  if (!weatherService.isConfigured()) return null;
  try { return await weatherService.getWeather(profile); } catch { return null; }
}

// ---- Farmer AI chat ----------------------------------------------------------------------
router.post('/chat', authorize('farmer'), aiLimiter, validate(z.object({ message: z.string().trim().min(2).max(2000), conversationId: z.number().int().positive().optional() })), wrap(async (req, res) => {
  const { message } = req.body;
  let convId = req.body.conversationId;
  if (convId) {
    if (!(await queryOne('SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?', [convId, req.user.id]))) throw notFound('AI conversation not found');
  } else {
    convId = (await query('INSERT INTO ai_conversations (user_id, title) VALUES (?, ?)', [req.user.id, message.slice(0, 60)])).insertId;
  }
  const history = await query('SELECT role, content FROM ai_messages WHERE ai_conversation_id = ? ORDER BY id DESC LIMIT 8', [convId]);
  history.reverse();
  await query("INSERT INTO ai_messages (ai_conversation_id, role, content) VALUES (?, 'user', ?)", [convId, message]);

  const started = Date.now();
  const [farmer, crops] = await Promise.all([farmerService.getProfile(req.user.id), farmerService.getCrops(req.user.id)]);
  const weather = await optionalWeather(farmer || {});
  const result = await aiService.answerFarmer({ userId: req.user.id, question: message, history, farmer, crops, weather });

  const saved = await query("INSERT INTO ai_messages (ai_conversation_id, role, content, sources, model) VALUES (?, 'assistant', ?, ?, ?)", [convId, result.answer, JSON.stringify(result.sources), result.model]);
  await query('UPDATE ai_conversations SET updated_at = NOW() WHERE id = ?', [convId]);
  // "AI response completed" notification only when the farmer may have navigated away (slow answer).
  if (Date.now() - started > 8000 && result.aiAvailable) await notifications.notify(req.user.id, { type: 'ai_response', title: 'AI response ready', body: message.slice(0, 80), link: '/farmer/ai' });

  ok(res, { conversationId: convId, message: { id: saved.insertId, role: 'assistant', content: result.answer, sources: result.sources, model: result.model, created_at: new Date().toISOString() }, aiAvailable: result.aiAvailable, disclaimer: result.disclaimer });
}));

router.get('/conversations', authorize('farmer'), wrap(async (req, res) => ok(res, { conversations: await query('SELECT id, title, created_at, updated_at FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100', [req.user.id]) })));

router.get('/conversations/:id(\\d+)', authorize('farmer'), wrap(async (req, res) => {
  const conv = await queryOne('SELECT id, title FROM ai_conversations WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!conv) throw notFound('AI conversation not found');
  const messages = await query('SELECT id, role, content, sources, model, created_at FROM ai_messages WHERE ai_conversation_id = ? ORDER BY id', [conv.id]);
  ok(res, { conversation: conv, messages: messages.map((m) => ({ ...m, sources: typeof m.sources === 'string' ? JSON.parse(m.sources) : m.sources })) });
}));

router.delete('/conversations/:id(\\d+)', authorize('farmer'), wrap(async (req, res) => {
  const r = await query('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!r.affectedRows) throw notFound('AI conversation not found');
  ok(res, {}, 'Deleted');
}));

router.get('/recommendations', authorize('farmer'), aiLimiter, wrap(async (req, res) => {
  const [farmer, crops] = await Promise.all([farmerService.getProfile(req.user.id), farmerService.getCrops(req.user.id)]);
  const weather = await optionalWeather(farmer || {});
  ok(res, await aiService.cropRecommendations({ userId: req.user.id, farmer, crops, weather }));
}));

// ---- Agent assist (suggestions only; nothing is sent to the farmer from here) ----------------
const assistSchema = z.object({
  action: z.enum(['ask', 'summarize', 'generate_response', 'improve_response', 'troubleshooting_questions']),
  ticketId: z.number().int().positive().optional(),
  conversationId: z.number().int().positive().optional(),
  draft: z.string().trim().max(4000).optional(),
}).refine((v) => v.ticketId || v.conversationId, 'ticketId or conversationId is required')
  .refine((v) => v.action !== 'improve_response' || v.draft, 'draft is required to improve a response');

router.post('/assist', authorize('agent', 'admin'), aiLimiter, validate(assistSchema), wrap(async (req, res) => {
  const { action, ticketId, conversationId, draft } = req.body;
  let farmerId, ticket = null, transcript = '';

  if (ticketId) {
    ticket = await queryOne('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (!ticket) throw notFound('Ticket not found');
    await farmerService.assertCanAccessFarmer(req.user, ticket.farmer_id);
    farmerId = ticket.farmer_id;
    const tm = await query('SELECT u.role, m.body FROM ticket_messages m JOIN users u ON u.id = m.sender_id WHERE m.ticket_id = ? ORDER BY m.id DESC LIMIT 20', [ticketId]);
    transcript += tm.reverse().map((m) => `${m.role}: ${m.body}`).join('\n');
  }
  if (conversationId) {
    const h = await chatService.history(req.user, conversationId, { limit: 30 });
    if (farmerId && farmerId !== h.conversation.farmer_id) throw badRequest('Ticket and conversation belong to different farmers');
    farmerId = h.conversation.farmer_id;
    transcript = `${h.messages.map((m) => `${m.sender_role}: ${m.body}`).join('\n')}${transcript ? `\n${transcript}` : ''}`;
  }

  const [farmer, crops] = await Promise.all([farmerService.getProfile(farmerId), farmerService.getCrops(farmerId)]);
  const weather = await optionalWeather(farmer || {});
  ok(res, await require('../services/aiService').assistAgent({ userId: req.user.id, action, transcript, ticket, draft, farmer, crops, weather }));
}));

module.exports = router;
