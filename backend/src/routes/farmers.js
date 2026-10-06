const express = require('express');
const { z } = require('zod');
const { query, queryOne } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ok, wrap, notFound, badRequest } = require('../utils/response');
const farmerService = require('../services/farmerService');
const assignmentService = require('../services/assignmentService');
const audit = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

const num = (min, max) => z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(min).max(max).nullable());
const text = (max) => z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable());

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  mobile: z.string().trim().regex(/^[0-9+\-\s]{7,20}$/).optional(),
  village: text(120).optional(), district: text(100).optional(), state: text(100).optional(), country: text(100).optional(),
  latitude: num(-90, 90).optional(), longitude: num(-180, 180).optional(),
  farm_size: num(0, 100000).optional(),
  farm_size_unit: z.enum(['acre', 'hectare', 'bigha']).optional(),
  soil_type: text(80).optional(), irrigation_type: text(80).optional(),
});

async function applyProfileUpdate(farmerId, body) {
  const userFields = ['name', 'mobile'].filter((f) => body[f] !== undefined);
  if (userFields.length) await query(`UPDATE users SET ${userFields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...userFields.map((f) => body[f]), farmerId]);
  const pf = ['village', 'district', 'state', 'country', 'latitude', 'longitude', 'farm_size', 'farm_size_unit', 'soil_type', 'irrigation_type'].filter((f) => body[f] !== undefined);
  if (pf.length) await query(`UPDATE farmer_profiles SET ${pf.map((f) => `${f} = ?`).join(', ')} WHERE user_id = ?`, [...pf.map((f) => body[f]), farmerId]);
}

// Location options for the profile location selector (managed by admins).
router.get('/locations', wrap(async (_req, res) => ok(res, { locations: await query('SELECT id, district, state, country, latitude, longitude FROM locations ORDER BY state, district') })));

// ---- Farmer self-service ---------------------------------------------------------------
router.get('/me', authorize('farmer'), wrap(async (req, res) => ok(res, { profile: await farmerService.getProfile(req.user.id) })));

router.put('/me', authorize('farmer'), validate(profileSchema), wrap(async (req, res) => {
  await applyProfileUpdate(req.user.id, req.body);
  ok(res, { profile: await farmerService.getProfile(req.user.id) }, 'Profile updated');
}));

router.get('/me/agent', authorize('farmer'), wrap(async (req, res) => ok(res, { agent: await assignmentService.getActiveAgent(req.user.id) })));

router.get('/me/dashboard', authorize('farmer'), wrap(async (req, res) => {
  const id = req.user.id;
  const [profile, crops, agent, tickets, aiChats, conversation, unread] = await Promise.all([
    farmerService.getProfile(id),
    farmerService.getCrops(id),
    assignmentService.getActiveAgent(id),
    query("SELECT id, subject, status, priority, created_at FROM tickets WHERE farmer_id = ? AND status NOT IN ('resolved','closed') ORDER BY id DESC LIMIT 5", [id]),
    query('SELECT id, title, updated_at FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5', [id]),
    queryOne(
      `SELECT c.id, c.last_message_at,
              (SELECT body FROM conversation_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id AND m.sender_id <> ? AND m.read_at IS NULL) AS unread
         FROM conversations c WHERE c.farmer_id = ?`, [id, id]),
    queryOne('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [id]),
  ]);
  ok(res, { profile, crops, agent, openTickets: tickets, recentAiChats: aiChats, conversation, unreadNotifications: unread.c });
}));

// ---- Admin / agent views ---------------------------------------------------------------
router.get('/', authorize('admin', 'agent'), wrap(async (req, res) => {
  const search = (req.query.search || '').toString().trim();
  const params = [];
  let where = "u.role = 'farmer'";
  if (req.user.role === 'agent') { where += ' AND a.agent_id = ?'; params.push(req.user.id); }
  if (search) { where += ' AND (u.name LIKE ? OR u.email LIKE ? OR fp.district LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.mobile, u.is_active, u.created_at, fp.village, fp.district, fp.state,
            a.agent_id, ag.name AS agent_name,
            (SELECT GROUP_CONCAT(DISTINCT c.crop_name SEPARATOR ', ') FROM crops c WHERE c.farmer_id = u.id) AS crops,
            (SELECT COUNT(*) FROM tickets t WHERE t.farmer_id = u.id AND t.status NOT IN ('resolved','closed')) AS open_tickets,
            (SELECT t.subject FROM tickets t WHERE t.farmer_id = u.id AND t.status NOT IN ('resolved','closed') ORDER BY FIELD(t.priority,'urgent','high','medium','low'), t.id DESC LIMIT 1) AS current_issue,
            (SELECT t.priority FROM tickets t WHERE t.farmer_id = u.id AND t.status NOT IN ('resolved','closed') ORDER BY FIELD(t.priority,'urgent','high','medium','low'), t.id DESC LIMIT 1) AS current_priority,
            (SELECT c.id FROM conversations c WHERE c.farmer_id = u.id) AS conversation_id,
            fp.latitude, fp.longitude
       FROM users u
       LEFT JOIN farmer_profiles fp ON fp.user_id = u.id
       LEFT JOIN agent_assignments a ON a.farmer_id = u.id AND a.ended_at IS NULL
       LEFT JOIN users ag ON ag.id = a.agent_id
      WHERE ${where} ORDER BY u.name LIMIT 500`,
    params
  );
  ok(res, { farmers: rows });
}));

router.get('/:id(\\d+)', authorize('admin', 'agent'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  await farmerService.assertCanAccessFarmer(req.user, id);
  const profile = await farmerService.getProfile(id);
  if (!profile) throw notFound('Farmer not found');
  const [crops, agent, tickets] = await Promise.all([
    farmerService.getCrops(id),
    assignmentService.getActiveAgent(id),
    query('SELECT id, subject, status, priority, created_at FROM tickets WHERE farmer_id = ? ORDER BY id DESC LIMIT 20', [id]),
  ]);
  ok(res, { profile, crops, agent, tickets });
}));

router.put('/:id(\\d+)', authorize('admin'), validate(profileSchema), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await farmerService.getProfile(id))) throw notFound('Farmer not found');
  if (!Object.keys(req.body).length) throw badRequest('Nothing to update');
  await applyProfileUpdate(id, req.body);
  await audit.record(req.user.id, 'farmer.update', 'user', id, { fields: Object.keys(req.body) });
  ok(res, { profile: await farmerService.getProfile(id) }, 'Farmer updated');
}));

module.exports = router;
