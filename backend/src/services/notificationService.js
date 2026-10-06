const { query } = require('../db');
const logger = require('../logger');

let io = null;
const setIo = (instance) => { io = instance; };

// Persist in MySQL, then push over Socket.IO to the user's private room (if online).
async function notify(userId, { type, title, body = null, link = null }) {
  try {
    const result = await query('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)', [userId, type, title, body, link]);
    if (io) io.to(`user:${userId}`).emit('notification:new', { id: result.insertId, type, title, body, link, is_read: 0, created_at: new Date().toISOString() });
  } catch (err) {
    logger.error('Failed to create notification', { userId, type, error: err });
  }
}

async function notifyRole(role, payload) {
  const users = await query("SELECT id FROM users WHERE role = ? AND is_active = 1", [role]);
  await Promise.all(users.map((u) => notify(u.id, payload)));
}

const list = (userId, limit = 50) =>
  query('SELECT id, type, title, body, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', [userId, limit]);
const unreadCount = async (userId) => (await query('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [userId]))[0].c;
const markRead = (userId, id) => query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
const markAllRead = (userId) => query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);

const emitToUser = (userId, event, payload) => { if (io) io.to(`user:${userId}`).emit(event, payload); };

const emitToRoom = (room, event, payload) => { if (io) io.to(room).emit(event, payload); };

module.exports = { setIo, emitToRoom, notify, notifyRole, list, unreadCount, markRead, markAllRead, emitToUser };
