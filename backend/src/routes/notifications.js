const express = require('express');
const { authenticate } = require('../middleware/auth');
const { ok, wrap } = require('../utils/response');
const svc = require('../services/notificationService');

const router = express.Router();
router.use(authenticate);

router.get('/', wrap(async (req, res) => ok(res, { notifications: await svc.list(req.user.id), unread: await svc.unreadCount(req.user.id) })));
router.patch('/read-all', wrap(async (req, res) => { await svc.markAllRead(req.user.id); ok(res, {}, 'All notifications marked as read'); }));
router.patch('/:id(\\d+)/read', wrap(async (req, res) => { await svc.markRead(req.user.id, Number(req.params.id)); ok(res, {}, 'Marked as read'); }));

module.exports = router;
