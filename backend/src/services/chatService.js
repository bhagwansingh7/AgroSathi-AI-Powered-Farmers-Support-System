// Shared by REST and Socket.IO so both paths persist to MySQL and notify identically.
const { query, queryOne } = require('../db');
const { forbidden, notFound, badRequest } = require('../utils/response');
const { agentHasFarmer } = require('./assignmentService');
const notifications = require('./notificationService');

const MAX_LEN = 4000;

async function getConversationFor(user, conversationId) {
  const conv = await queryOne(
    `SELECT c.*, f.name AS farmer_name, a.name AS agent_name FROM conversations c
       JOIN users f ON f.id = c.farmer_id LEFT JOIN users a ON a.id = c.agent_id WHERE c.id = ?`, [conversationId]);
  if (!conv) throw notFound('Conversation not found');
  const canRead = user.role === 'admin' || (user.role === 'farmer' && conv.farmer_id === user.id) || (user.role === 'agent' && conv.agent_id === user.id && (await agentHasFarmer(user.id, conv.farmer_id)));
  if (!canRead) throw forbidden('You do not have access to this conversation');
  return conv;
}

// Farmer conversation row is created lazily (also created on assignment).
async function ensureFarmerConversation(farmerId) {
  await query(
    `INSERT INTO conversations (farmer_id, agent_id)
     SELECT ?, (SELECT agent_id FROM agent_assignments WHERE farmer_id = ? AND ended_at IS NULL)
     ON DUPLICATE KEY UPDATE farmer_id = farmer_id`, [farmerId, farmerId]);
  return queryOne('SELECT id FROM conversations WHERE farmer_id = ?', [farmerId]);
}

async function sendMessage(user, conversationId, rawBody) {
  const body = (rawBody || '').toString().trim();
  if (!body) throw badRequest('Message cannot be empty');
  if (body.length > MAX_LEN) throw badRequest(`Message is too long (max ${MAX_LEN} characters)`);
  const conv = await getConversationFor(user, conversationId);
  if (user.role === 'admin') throw forbidden('Admins can monitor conversations but not send messages');
  if (!conv.agent_id) throw badRequest('No agent is assigned yet. Please create a support request.');

  const r = await query('INSERT INTO conversation_messages (conversation_id, sender_id, body) VALUES (?,?,?)', [conv.id, user.id, body]);
  await query('UPDATE conversations SET last_message_at = NOW() WHERE id = ?', [conv.id]);
  const message = await queryOne(
    'SELECT m.id, m.conversation_id, m.sender_id, u.name AS sender_name, u.role AS sender_role, m.body, m.read_at, m.created_at FROM conversation_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?', [r.insertId]);

  notifications.emitToRoom(`conv:${conv.id}`, 'message:new', message);

  // Notify the other participant. Collapse into one unread notification per 10 minutes to avoid spam.
  const recipientId = user.role === 'farmer' ? conv.agent_id : conv.farmer_id;
  const link = user.role === 'farmer' ? `/agent/chat?c=${conv.id}` : '/farmer/chat';
  const recent = await queryOne("SELECT id FROM notifications WHERE user_id = ? AND type = 'new_message' AND link = ? AND is_read = 0 AND created_at > (NOW() - INTERVAL 10 MINUTE) LIMIT 1", [recipientId, link]);
  if (!recent) {
    await notifications.notify(recipientId, { type: 'new_message', title: `New message from ${user.name}`, body: body.slice(0, 120), link });
  } else {
    notifications.emitToUser(recipientId, 'message:notify', { conversationId: conv.id, from: user.name });
  }
  return message;
}

async function markRead(user, conversationId) {
  const conv = await getConversationFor(user, conversationId);
  if (user.role === 'admin') return { updated: 0 };
  const r = await query('UPDATE conversation_messages SET read_at = NOW() WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL', [conv.id, user.id]);
  if (r.affectedRows) notifications.emitToRoom(`conv:${conv.id}`, 'message:read', { conversationId: conv.id, readerId: user.id, at: new Date().toISOString() });
  return { updated: r.affectedRows };
}

async function history(user, conversationId, { before, limit = 50 } = {}) {
  const conv = await getConversationFor(user, conversationId);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const params = [conv.id];
  let where = 'm.conversation_id = ?';
  if (before) { where += ' AND m.id < ?'; params.push(Number(before)); }
  const rows = await query(
    `SELECT m.id, m.conversation_id, m.sender_id, u.name AS sender_name, u.role AS sender_role, m.body, m.read_at, m.created_at
       FROM conversation_messages m JOIN users u ON u.id = m.sender_id WHERE ${where} ORDER BY m.id DESC LIMIT ?`, [...params, lim]);
  return { conversation: conv, messages: rows.reverse(), hasMore: rows.length === lim };
}

module.exports = { getConversationFor, ensureFarmerConversation, sendMessage, markRead, history };
