// AIService: the only module that talks to an LLM. Works with any OpenAI-compatible
// /chat/completions endpoint (configure AI_BASE_URL / AI_MODEL / AI_API_KEY).
const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const { query } = require('../db');
const { cacheGet, cacheSet } = require('../redis');
const vectorStore = require('./vectorStoreService');
const { HttpError } = require('../utils/response');

const isConfigured = () => !!config.ai.apiKey;

const DISCLAIMER = 'AI-generated guidance. Please confirm important decisions (pesticides, harvest timing, large purchases) with your agent or a local agriculture officer.';

const FARMER_SYSTEM = `You are AgroSathi, an agricultural assistant for small and medium farmers in India.
Rules:
- Answer in the same language the farmer used, in simple, short sentences.
- Use the KNOWLEDGE excerpts and the FARMER CONTEXT when they are relevant. If they do not cover the question, say so and give only well-established general advice.
- Never present guesses as facts. Offer likely causes, say what to check, and what would change the advice.
- Do not give exact pesticide/chemical brands or doses. Recommend confirming with the assigned agent or a local agriculture officer / Krishi Vigyan Kendra for treatments and costly decisions.
- If weather data is given, mention it only when relevant.
- Keep answers under 200 words.`;

const AGENT_SYSTEM = `You are an assistant for human agricultural support agents. You help the agent; you never speak to the farmer directly.
Be concise and practical. Use the KNOWLEDGE excerpts and farmer context when relevant. Clearly mark uncertainty. Do not invent facts about the farmer. Do not recommend specific chemical doses.`;

async function chat(messages, { temperature = 0.3, maxTokens = 700 } = {}) {
  if (!isConfigured()) throw new HttpError(503, 'AI is not configured (AI_API_KEY missing)');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.apiKey}` },
      body: JSON.stringify({ model: config.ai.model, messages, temperature, max_tokens: maxTokens }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`AI provider responded with HTTP ${res.status}`);
    const json = await res.json();
    const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!text) throw new Error('AI provider returned an empty response');
    return text.trim();
  } finally { clearTimeout(timer); }
}

async function logUsage(userId, kind, success, startedAt) {
  try { await query('INSERT INTO ai_usage (user_id, kind, success, latency_ms) VALUES (?,?,?,?)', [userId || null, kind, success ? 1 : 0, Date.now() - startedAt]); } catch (e) { logger.warn('ai_usage insert failed', { message: e.message }); }
}

function describeFarmer({ farmer, crops = [], weather }) {
  const lines = [];
  if (farmer) {
    lines.push(`Location: ${[farmer.village, farmer.district, farmer.state].filter(Boolean).join(', ') || 'unknown'}`);
    if (farmer.soil_type) lines.push(`Soil: ${farmer.soil_type}`);
    if (farmer.irrigation_type) lines.push(`Irrigation: ${farmer.irrigation_type}`);
  }
  if (crops.length) {
    lines.push('Crops: ' + crops.map((c) => `${c.crop_name}${c.variety ? ` (${c.variety})` : ''}${c.sowing_date ? `, sown ${new Date(c.sowing_date).toISOString().slice(0, 10)}` : ''}${c.expected_harvest_date ? `, harvest ~${new Date(c.expected_harvest_date).toISOString().slice(0, 10)}` : ''}${c.notes ? `, notes: ${c.notes}` : ''}`).join('; '));
  }
  if (weather) {
    const f = weather.forecast.slice(0, 3).map((d) => `${d.label} ${d.chanceOfRain}% rain`).join(', ');
    lines.push(`Weather now: ${weather.current.tempC}°C, ${weather.current.condition}, humidity ${weather.current.humidity}%. Rain chance: ${f}`);
  }
  return lines.join('\n') || 'No farmer context available.';
}

const formatKnowledge = (sources) => (sources.length ? sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.content}`).join('\n\n') : 'No relevant knowledge found.');

async function retrieve(q) {
  try { return await vectorStore.search(q, 4); } catch (err) { logger.warn('Knowledge retrieval failed', { message: err.message }); return []; }
}

/**
 * Farmer-facing answer. Always returns an object (never throws for provider problems):
 * { answer, sources, model, aiAvailable, disclaimer }. If the LLM is unavailable we return the
 * retrieved knowledge excerpts honestly labelled as such so the farmer still gets something useful.
 */
async function answerFarmer({ userId, question, history = [], farmer, crops, weather }) {
  const started = Date.now();
  const sources = await retrieve(`${question} ${(crops || []).map((c) => c.crop_name).join(' ')}`);
  const cacheKey = history.length === 0 ? `ai:ans:${crypto.createHash('sha1').update(question.toLowerCase().trim() + '|' + (crops || []).map((c) => c.crop_name).join(',') + '|' + (farmer && farmer.state || '')).digest('hex')}` : null;

  if (cacheKey) {
    const hit = await cacheGet(cacheKey);
    if (hit) { await logUsage(userId, 'farmer_chat_cached', true, started); return { ...hit, cached: true }; }
  }

  const context = `FARMER CONTEXT:\n${describeFarmer({ farmer, crops, weather })}\n\nKNOWLEDGE:\n${formatKnowledge(sources)}`;
  const messages = [
    { role: 'system', content: `${FARMER_SYSTEM}\n\n${context}` },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  try {
    const answer = await chat(messages);
    const result = { answer, sources: sources.map(({ documentId, title, category }) => ({ documentId, title, category })), model: config.ai.model, aiAvailable: true, disclaimer: DISCLAIMER };
    if (cacheKey) await cacheSet(cacheKey, result, 3600);
    await logUsage(userId, 'farmer_chat', true, started);
    return result;
  } catch (err) {
    logger.error('AI failure (farmer chat)', { message: err.message });
    await logUsage(userId, 'farmer_chat', false, started);
    const fallback = sources.length
      ? `The AI assistant is not available right now, so here is related guidance from our knowledge base:\n\n${sources.slice(0, 2).map((s) => `• ${s.title}: ${s.content.slice(0, 350)}…`).join('\n\n')}\n\nYou can also create a support request to talk to your agent.`
      : 'The AI assistant is not available right now. You can create a support request or chat with your agent for help.';
    return { answer: fallback, sources: sources.map(({ documentId, title, category }) => ({ documentId, title, category })), model: null, aiAvailable: false, disclaimer: DISCLAIMER };
  }
}

const AGENT_ACTIONS = {
  ask: 'Analyse the farmer\'s issue. Reply with four short sections: "Summary", "Possible causes", "Questions to ask the farmer", "Suggested next steps".',
  summarize: 'Summarize this conversation for the agent in 4-6 bullet points: issue, crop/stage, what has been tried, what is pending.',
  generate_response: 'Write a polite, simple reply the agent could send to the farmer next. Plain text only, under 120 words. It is a draft; the agent will review it.',
  improve_response: 'Improve the agent\'s draft: keep the meaning, make it clearer, simpler and polite. Return only the improved message.',
  troubleshooting_questions: 'List 5 short troubleshooting questions the agent should ask the farmer to narrow down the cause.',
};

// Agent assistance. Returns suggestions only — nothing is ever sent to the farmer from here.
async function assistAgent({ userId, action, transcript, ticket, draft, farmer, crops, weather }) {
  if (!AGENT_ACTIONS[action]) throw new HttpError(400, 'Unknown AI assist action');
  const started = Date.now();
  const seed = `${ticket ? `${ticket.subject}. ${ticket.description}` : ''} ${transcript.slice(-1500)} ${(crops || []).map((c) => c.crop_name).join(' ')}`;
  const sources = await retrieve(seed);
  const user = [
    `TASK: ${AGENT_ACTIONS[action]}`,
    ticket ? `TICKET: [${ticket.priority}] ${ticket.subject}\n${ticket.description}` : '',
    `FARMER CONTEXT:\n${describeFarmer({ farmer, crops, weather })}`,
    `KNOWLEDGE:\n${formatKnowledge(sources)}`,
    `CONVERSATION (oldest first):\n${transcript || '(no messages yet)'}`,
    draft ? `AGENT DRAFT:\n${draft}` : '',
  ].filter(Boolean).join('\n\n');
  try {
    const text = await chat([{ role: 'system', content: AGENT_SYSTEM }, { role: 'user', content: user }], { maxTokens: 800 });
    await logUsage(userId, `agent_${action}`, true, started);
    return { text, sources: sources.map(({ documentId, title }) => ({ documentId, title })), model: config.ai.model };
  } catch (err) {
    await logUsage(userId, `agent_${action}`, false, started);
    if (err instanceof HttpError) throw err;
    logger.error('AI failure (agent assist)', { message: err.message });
    throw new HttpError(502, 'AI assistant is temporarily unavailable. You can continue the conversation manually.');
  }
}

// Crop recommendations: LLM when configured, otherwise transparent rule-based tips.
async function cropRecommendations({ userId, farmer, crops, weather }) {
  const started = Date.now();
  const rules = [];
  const today = Date.now();
  for (const c of crops) {
    if (c.expected_harvest_date) {
      const d = Math.round((new Date(c.expected_harvest_date) - today) / 86400000);
      if (d >= 0 && d <= 14) rules.push(`${c.crop_name}: harvest is expected in about ${d} day(s). Watch the forecast for a dry window and plan labour, drying and storage.`);
    }
    if (c.sowing_date) {
      const d = Math.round((today - new Date(c.sowing_date)) / 86400000);
      if (d >= 18 && d <= 28 && /wheat/i.test(c.crop_name)) rules.push(`${c.crop_name}: about ${d} days after sowing is the crown root initiation stage, which is sensitive to water stress. Check with your agent about irrigation timing.`);
    }
  }
  if (weather && weather.forecast[0] && weather.forecast.slice(0, 2).some((x) => x.chanceOfRain >= 60)) rules.push('Rain is likely in the next two days. Review irrigation and any spraying plans.');
  if (!rules.length) rules.push('No time-sensitive actions detected from your crop dates. Keep monitoring fields regularly and update crop details for better guidance.');

  if (!isConfigured() || !crops.length) return { source: 'rules', items: rules, disclaimer: DISCLAIMER };
  try {
    const sources = await retrieve(crops.map((c) => c.crop_name).join(' '));
    const text = await chat([
      { role: 'system', content: FARMER_SYSTEM },
      { role: 'user', content: `Give 3-5 practical, general recommendations for this farmer for the coming week, as short bullet points.\n\nFARMER CONTEXT:\n${describeFarmer({ farmer, crops, weather })}\n\nKNOWLEDGE:\n${formatKnowledge(sources)}` },
    ]);
    await logUsage(userId, 'recommendations', true, started);
    return { source: 'ai', items: text.split('\n').map((l) => l.replace(/^[-•*\d.\s]+/, '').trim()).filter(Boolean), disclaimer: DISCLAIMER };
  } catch (err) {
    logger.error('AI failure (recommendations)', { message: err.message });
    await logUsage(userId, 'recommendations', false, started);
    return { source: 'rules', items: rules, disclaimer: DISCLAIMER };
  }
}

module.exports = { isConfigured, answerFarmer, assistAgent, cropRecommendations, DISCLAIMER, describeFarmer };
