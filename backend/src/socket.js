const { Server } = require('socket.io');
const config = require('./config');
const logger = require('./logger');
const { userFromToken, COOKIE_NAME } = require('./middleware/auth');
const chat = require('./services/chatService');
const presence = require('./services/presenceService');
const notifications = require('./services/notificationService');
const { query } = require('./db');

// Rooms: user:{id} (personal events), conv:{id} (conversation events).
function attachSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: config.frontendUrl, credentials: true }, pingInterval: 20000, pingTimeout: 20000 });
  notifications.setIo(io);

  // Authenticate with the same HTTP-only cookie used by the REST API.
  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.cookie || '';
      const raw = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
      if (!raw) return next(new Error('Authentication required'));
      const token = decodeURIComponent(raw.slice(COOKIE_NAME.length + 1));
      socket.user = await userFromToken(token);
      next();
    } catch (err) {
      next(new Error(err.message || 'Authentication failed'));
    }
  });

  // Tell the other participant(s) of the user's conversations that presence changed.
  async function broadcastPresence(user, online) {
    const rows = user.role === 'farmer'
      ? await query('SELECT id FROM conversations WHERE farmer_id = ?', [user.id])
      : await query('SELECT id FROM conversations WHERE agent_id = ?', [user.id]);
    rows.forEach((r) => io.to(`conv:${r.id}`).emit('presence:update', { userId: user.id, role: user.role, online }));
  }

  io.on('connection', async (socket) => {
    const user = socket.user;
    socket.join(`user:${user.id}`);
    try {
      if (await presence.connect(user.id)) await broadcastPresence(user, true);
    } catch (err) { logger.warn('Presence connect failed', { message: err.message }); }

    // Join a conversation room (authorization is checked by chat service).
    socket.on('conversation:join', async ({ conversationId } = {}, ack) => {
      try {
        const conv = await chat.getConversationFor(user, Number(conversationId));
        socket.join(`conv:${conv.id}`);
        const otherId = user.role === 'farmer' ? conv.agent_id : conv.farmer_id;
        ack && ack({ ok: true, otherOnline: otherId ? await presence.isOnline(otherId) : false });
      } catch (err) { ack && ack({ ok: false, message: err.message }); }
    });

    socket.on('message:send', async ({ conversationId, body } = {}, ack) => {
      try {
        const message = await chat.sendMessage(user, Number(conversationId), body);
        ack && ack({ ok: true, message });
      } catch (err) { ack && ack({ ok: false, message: err.message }); }
    });

    socket.on('typing:start', ({ conversationId } = {}) => socket.to(`conv:${Number(conversationId)}`).emit('typing', { conversationId: Number(conversationId), userId: user.id, name: user.name, typing: true }));
    socket.on('typing:stop', ({ conversationId } = {}) => socket.to(`conv:${Number(conversationId)}`).emit('typing', { conversationId: Number(conversationId), userId: user.id, name: user.name, typing: false }));

    socket.on('message:read', async ({ conversationId } = {}, ack) => {
      try { ack && ack({ ok: true, ...(await chat.markRead(user, Number(conversationId))) }); } catch (err) { ack && ack({ ok: false, message: err.message }); }
    });

    socket.on('disconnect', async () => {
      try { if (await presence.disconnect(user.id)) await broadcastPresence(user, false); } catch (err) { logger.warn('Presence disconnect failed', { message: err.message }); }
    });
  });

  return io;
}

module.exports = { attachSocket };
