const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ok, created, wrap } = require('../utils/response');
const chat = require('../services/chatService');
const assignmentService = require('../services/assignmentService');
const presence = require('../services/presenceService');

const router = express.Router();
router.use(authenticate);

// Farmer's own conversation + agent card + recent history.
router.get('/mine', authorize('farmer'), wrap(async (req, res) => {
  const { id } = await chat.ensureFarmerConversation(req.user.id);
  const [agent, h] = await Promise.all([assignmentService.getActiveAgent(req.user.id), chat.history(req.user, id, { limit: 50 })]);
  const agentOnline = agent ? await presence.isOnline(agent.id) : false;
  ok(res, { conversationId: id, agent: agent ? { ...agent, online: agentOnline } : null, messages: h.messages, hasMore: h.hasMore });
}));

// Agent: own conversations. Admin: all (monitoring).
router.get('/', authorize('agent', 'admin'), wrap(async (req, res) => {
  const isAgent = req.user.role === 'agent';
  const rows = await query(
    `SELECT c.id, c.farmer_id, c.agent_id, c.last_message_at, f.name AS farmer_name, a.name AS agent_name,
            (SELECT body FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id AND m.sender_id = c.farmer_id AND m.read_at IS NULL) AS unread,
            (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c JOIN users f ON f.id = c.farmer_id LEFT JOIN users a ON a.id = c.agent_id
      ${isAgent ? 'WHERE c.agent_id = ?' : ''} ORDER BY c.last_message_at DESC, c.id DESC LIMIT 300`,
    isAgent ? [req.user.id] : []);
  const online = new Set(await presence.onlineIds());
  ok(res, { conversations: rows.map((r) => ({ ...r, farmer_online: online.has(r.farmer_id) })) });
}));

router.get('/:id(\\d+)/messages', wrap(async (req, res) => {
  const h = await chat.history(req.user, Number(req.params.id), { before: req.query.before, limit: req.query.limit });
  ok(res, { conversation: { id: h.conversation.id, farmer_id: h.conversation.farmer_id, agent_id: h.conversation.agent_id, farmer_name: h.conversation.farmer_name, agent_name: h.conversation.agent_name }, messages: h.messages, hasMore: h.hasMore });
}));

// REST fallback (used if the socket is down); same persistence path as the socket event.
router.post('/:id(\\d+)/messages', validate(z.object({ body: z.string().trim().min(1).max(4000) })), wrap(async (req, res) => {
  created(res, { message: await chat.sendMessage(req.user, Number(req.params.id), req.body.body) }, 'Message sent');
}));

router.post('/:id(\\d+)/read', wrap(async (req, res) => ok(res, await chat.markRead(req.user, Number(req.params.id)))));

module.exports = router;
