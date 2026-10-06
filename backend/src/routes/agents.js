const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { ok, wrap } = require('../utils/response');
const assignmentService = require('../services/assignmentService');
const presence = require('../services/presenceService');

const router = express.Router();
router.use(authenticate);

router.get('/', authorize('admin'), wrap(async (_req, res) => {
  const [agents, online] = await Promise.all([assignmentService.workload(), presence.onlineIds()]);
  const set = new Set(online);
  ok(res, { agents: agents.map((a) => ({ ...a, online: set.has(a.id) })) });
}));

router.get('/me/dashboard', authorize('agent'), wrap(async (req, res) => {
  const id = req.user.id;
  const [[counts], priorityTickets] = await Promise.all([
    query(
      `SELECT
         (SELECT COUNT(*) FROM agent_assignments WHERE agent_id = ? AND ended_at IS NULL) AS farmers,
         (SELECT COUNT(*) FROM tickets WHERE agent_id = ? AND status IN ('assigned','in_progress','waiting_for_farmer')) AS my_tickets,
         (SELECT COUNT(*) FROM tickets WHERE agent_id = ? AND status = 'assigned') AS pending_requests,
         (SELECT COUNT(DISTINCT c.id) FROM conversations c JOIN conversation_messages m ON m.conversation_id = c.id
           WHERE c.agent_id = ? AND m.sender_id = c.farmer_id AND m.read_at IS NULL) AS active_conversations,
         (SELECT COUNT(*) FROM tickets WHERE agent_id = ? AND status IN ('resolved','closed')) AS resolved_tickets`,
      [id, id, id, id, id]),
    query(
      `SELECT t.id, t.subject, t.priority, t.status, t.farmer_id, f.name AS farmer_name, c.crop_name, fp.village, fp.district, fp.state,
              (SELECT cv.id FROM conversations cv WHERE cv.farmer_id = t.farmer_id) AS conversation_id
         FROM tickets t JOIN users f ON f.id = t.farmer_id LEFT JOIN farmer_profiles fp ON fp.user_id = t.farmer_id LEFT JOIN crops c ON c.id = t.crop_id
        WHERE t.agent_id = ? AND t.status NOT IN ('resolved','closed')
        ORDER BY FIELD(t.priority,'urgent','high','medium','low'), t.id DESC LIMIT 8`, [id]),
  ]);
  ok(res, { counts, priorityTickets });
}));

module.exports = router;
