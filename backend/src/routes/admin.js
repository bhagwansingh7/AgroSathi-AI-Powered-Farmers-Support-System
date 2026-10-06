const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, queryOne, withTransaction } = require('../db');
const config = require('../config');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ok, created, wrap, notFound, badRequest } = require('../utils/response');
const assignmentService = require('../services/assignmentService');
const presence = require('../services/presenceService');
const audit = require('../services/auditService');
const aiService = require('../services/aiService');
const weatherService = require('../services/weatherService');
const vectorStore = require('../services/vectorStoreService');
const weatherJob = require('../jobs/weatherAlerts');
const { redis } = require('../redis');

const router = express.Router();
router.use(authenticate, authorize('admin')); // every /api/admin route is admin-only

// ---- Stats ------------------------------------------------------------------------------
router.get('/stats', wrap(async (_req, res) => {
  const [[totals], ticketsByStatus, ticketsPerDay, aiPerDay, onlineAgents] = await Promise.all([
    query(`SELECT
       (SELECT COUNT(*) FROM users WHERE role='farmer') AS farmers,
       (SELECT COUNT(*) FROM users WHERE role='agent') AS agents,
       (SELECT COUNT(*) FROM tickets WHERE status IN ('assigned','in_progress','waiting_for_farmer')) AS active_tickets,
       (SELECT COUNT(*) FROM tickets WHERE status = 'open') AS open_tickets,
       (SELECT COUNT(*) FROM tickets WHERE status IN ('resolved','closed')) AS resolved_tickets,
       (SELECT COUNT(*) FROM ai_usage) AS ai_queries,
       (SELECT COUNT(*) FROM farmer_profiles fp WHERE NOT EXISTS (SELECT 1 FROM agent_assignments a WHERE a.farmer_id = fp.user_id AND a.ended_at IS NULL)) AS unassigned_farmers`),
    query('SELECT status, COUNT(*) AS count FROM tickets GROUP BY status'),
    query('SELECT DATE(created_at) AS day, COUNT(*) AS count FROM tickets WHERE created_at >= (NOW() - INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY day'),
    query('SELECT DATE(created_at) AS day, COUNT(*) AS count, SUM(success = 0) AS failed FROM ai_usage WHERE created_at >= (NOW() - INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY day'),
    presence.onlineAgentCount(),
  ]);
  ok(res, { totals: { ...totals, online_agents: onlineAgents }, ticketsByStatus, ticketsPerDay, aiPerDay });
}));

// ---- Users ------------------------------------------------------------------------------
const pwd = z.string().min(8).max(72).regex(/[A-Za-z]/, 'Password needs a letter').regex(/[0-9]/, 'Password needs a number');
const blank = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable());
const createUserSchema = z.object({
  role: z.enum(['farmer', 'agent', 'admin']),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  mobile: blank(z.string().trim().regex(/^[0-9+\-\s]{7,20}$/)).optional(),
  password: pwd,
  specialization: blank(z.string().trim().max(120)).optional(),
  max_farmers: z.coerce.number().int().min(1).max(500).optional(),
  district: blank(z.string().trim().max(100)).optional(),
  state: blank(z.string().trim().max(100)).optional(),
});
const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(190).optional(),
  mobile: blank(z.string().trim().regex(/^[0-9+\-\s]{7,20}$/)).optional(),
  role: z.enum(['farmer', 'agent', 'admin']).optional(),
  is_active: z.boolean().optional(),
  password: pwd.optional(),
  specialization: blank(z.string().trim().max(120)).optional(),
  max_farmers: z.coerce.number().int().min(1).max(500).optional(),
});

async function ensureProfile(conn, userId, role, extra = {}) {
  if (role === 'farmer') await conn.query('INSERT IGNORE INTO farmer_profiles (user_id, district, state) VALUES (?,?,?)', [userId, extra.district ?? null, extra.state ?? null]);
  if (role === 'agent') await conn.query('INSERT INTO agent_profiles (user_id, specialization, max_farmers) VALUES (?,?,?) ON DUPLICATE KEY UPDATE user_id = user_id', [userId, extra.specialization ?? null, extra.max_farmers ?? 25]);
}

router.get('/users', wrap(async (req, res) => {
  const where = [], params = [];
  if (['farmer', 'agent', 'admin'].includes(req.query.role)) { where.push('u.role = ?'); params.push(req.query.role); }
  const s = (req.query.search || '').toString().trim();
  if (s) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${s}%`, `%${s}%`); }
  const users = await query(
    `SELECT u.id, u.role, u.name, u.email, u.mobile, u.is_active, u.created_at, u.last_login_at, ap.specialization, ap.max_farmers
       FROM users u LEFT JOIN agent_profiles ap ON ap.user_id = u.id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.role, u.name LIMIT 500`, params);
  ok(res, { users });
}));

router.post('/users', validate(createUserSchema), wrap(async (req, res) => {
  const b = req.body;
  const hash = await bcrypt.hash(b.password, 10);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query('INSERT INTO users (role, name, email, mobile, password_hash) VALUES (?,?,?,?,?)', [b.role, b.name, b.email, b.mobile ?? null, hash]);
    await ensureProfile(conn, r.insertId, b.role, b);
    return r.insertId;
  });
  await audit.record(req.user.id, 'user.create', 'user', id, { role: b.role, email: b.email });
  created(res, { id }, 'User created');
}));

router.put('/users/:id(\\d+)', validate(updateUserSchema), wrap(async (req, res) => {
  const id = Number(req.params.id), b = req.body;
  const user = await queryOne('SELECT id, role, is_active FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('User not found');
  if (id === req.user.id && ((b.role && b.role !== 'admin') || b.is_active === false)) throw badRequest('You cannot demote or deactivate your own account');

  await withTransaction(async (conn) => {
    const sets = [], params = [];
    for (const f of ['name', 'email', 'mobile']) if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f]); }
    if (b.is_active !== undefined) { sets.push('is_active = ?'); params.push(b.is_active ? 1 : 0); }
    if (b.role !== undefined) { sets.push('role = ?'); params.push(b.role); }
    if (b.password) { sets.push('password_hash = ?'); params.push(await bcrypt.hash(b.password, 10)); }
    if (sets.length) await conn.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    if (b.role && b.role !== user.role) {
      // Role changed: drop assignments that only made sense in the old role.
      await conn.query('UPDATE agent_assignments SET ended_at = NOW(), active_farmer_id = NULL WHERE (farmer_id = ? OR agent_id = ?) AND ended_at IS NULL', [id, id]);
      await conn.query('UPDATE conversations SET agent_id = NULL WHERE agent_id = ?', [id]);
      await ensureProfile(conn, id, b.role, b);
    }
    if (user.role === 'agent' || b.role === 'agent') {
      const spec = b.specialization, max = b.max_farmers;
      if (spec !== undefined) await conn.query('UPDATE agent_profiles SET specialization = ? WHERE user_id = ?', [spec, id]);
      if (max !== undefined) await conn.query('UPDATE agent_profiles SET max_farmers = ? WHERE user_id = ?', [max, id]);
    }
  });
  const action = b.role && b.role !== user.role ? 'user.role_change' : b.is_active !== undefined && b.is_active !== !!user.is_active ? (b.is_active ? 'user.activate' : 'user.deactivate') : 'user.update';
  await audit.record(req.user.id, action, 'user', id, { fields: Object.keys(b).filter((k) => k !== 'password'), password_reset: !!b.password, role: b.role ? { from: user.role, to: b.role } : undefined });
  ok(res, {}, 'User updated');
}));

router.delete('/users/:id(\\d+)', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw badRequest('You cannot delete your own account');
  const user = await queryOne('SELECT id, name, role, email FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('User not found');
  await query('DELETE FROM users WHERE id = ?', [id]); // profiles, crops, tickets etc. cascade
  await audit.record(req.user.id, 'user.delete', 'user', id, { role: user.role, email: user.email });
  ok(res, {}, 'User deleted');
}));

// ---- Assignments ------------------------------------------------------------------------
router.get('/assignments', wrap(async (_req, res) => {
  const [workload, farmers, online] = await Promise.all([
    assignmentService.workload(),
    query(`SELECT u.id, u.name, fp.district, fp.state, a.agent_id, ag.name AS agent_name, a.assigned_at,
                  (SELECT COUNT(*) FROM tickets t WHERE t.farmer_id = u.id AND t.status NOT IN ('resolved','closed')) AS open_tickets
             FROM users u LEFT JOIN farmer_profiles fp ON fp.user_id = u.id
             LEFT JOIN agent_assignments a ON a.farmer_id = u.id AND a.ended_at IS NULL LEFT JOIN users ag ON ag.id = a.agent_id
            WHERE u.role = 'farmer' AND u.is_active = 1 ORDER BY (a.agent_id IS NOT NULL), u.name`),
    presence.onlineIds(),
  ]);
  const set = new Set(online);
  ok(res, { agents: workload.map((a) => ({ ...a, online: set.has(a.id) })), farmers });
}));

router.get('/assignments/suggest', wrap(async (_req, res) => ok(res, { agent: await assignmentService.suggestAgent() })));

router.post('/assignments', validate(z.object({ farmerId: z.number().int().positive(), agentId: z.number().int().positive() })), wrap(async (req, res) => {
  ok(res, { agent: await assignmentService.assign(req.body.farmerId, req.body.agentId, req.user.id) }, 'Agent assigned');
}));

router.delete('/assignments/:farmerId(\\d+)', wrap(async (req, res) => {
  await assignmentService.unassign(Number(req.params.farmerId), req.user.id);
  ok(res, {}, 'Farmer unassigned');
}));

// ---- Crop categories & locations --------------------------------------------------------
const catSchema = z.object({ name: z.string().trim().min(2).max(100), description: blank(z.string().trim().max(255)).optional() });
router.get('/crop-categories', wrap(async (_req, res) => ok(res, { categories: await query('SELECT cc.*, (SELECT COUNT(*) FROM crops c WHERE c.category_id = cc.id) AS crops FROM crop_categories cc ORDER BY name') })));
router.post('/crop-categories', validate(catSchema), wrap(async (req, res) => {
  const r = await query('INSERT INTO crop_categories (name, description) VALUES (?,?)', [req.body.name, req.body.description ?? null]);
  await audit.record(req.user.id, 'crop_category.create', 'crop_category', r.insertId, { name: req.body.name });
  created(res, { id: r.insertId }, 'Category added');
}));
router.put('/crop-categories/:id(\\d+)', validate(catSchema), wrap(async (req, res) => {
  const r = await query('UPDATE crop_categories SET name = ?, description = ? WHERE id = ?', [req.body.name, req.body.description ?? null, req.params.id]);
  if (!r.affectedRows) throw notFound('Category not found');
  await audit.record(req.user.id, 'crop_category.update', 'crop_category', Number(req.params.id), { name: req.body.name });
  ok(res, {}, 'Category updated');
}));
router.delete('/crop-categories/:id(\\d+)', wrap(async (req, res) => {
  const r = await query('DELETE FROM crop_categories WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) throw notFound('Category not found');
  await audit.record(req.user.id, 'crop_category.delete', 'crop_category', Number(req.params.id));
  ok(res, {}, 'Category deleted');
}));
router.get('/crops', wrap(async (_req, res) => ok(res, { crops: await query(`SELECT c.id, c.crop_name, c.variety, c.sowing_date, c.expected_harvest_date, c.area, f.name AS farmer_name, cc.name AS category FROM crops c JOIN users f ON f.id = c.farmer_id LEFT JOIN crop_categories cc ON cc.id = c.category_id ORDER BY c.id DESC LIMIT 500`) })));

const locSchema = z.object({
  district: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), country: z.string().trim().max(100).default('India'),
  latitude: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(-90).max(90).nullable()).optional(),
  longitude: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(-180).max(180).nullable()).optional(),
});
router.get('/locations', wrap(async (_req, res) => ok(res, { locations: await query('SELECT * FROM locations ORDER BY state, district') })));
router.post('/locations', validate(locSchema), wrap(async (req, res) => {
  const b = req.body;
  const r = await query('INSERT INTO locations (district, state, country, latitude, longitude) VALUES (?,?,?,?,?)', [b.district, b.state, b.country, b.latitude ?? null, b.longitude ?? null]);
  await audit.record(req.user.id, 'location.create', 'location', r.insertId, { district: b.district, state: b.state });
  created(res, { id: r.insertId }, 'Location added');
}));
router.put('/locations/:id(\\d+)', validate(locSchema), wrap(async (req, res) => {
  const b = req.body;
  const r = await query('UPDATE locations SET district=?, state=?, country=?, latitude=?, longitude=? WHERE id=?', [b.district, b.state, b.country, b.latitude ?? null, b.longitude ?? null, req.params.id]);
  if (!r.affectedRows) throw notFound('Location not found');
  await audit.record(req.user.id, 'location.update', 'location', Number(req.params.id), { district: b.district });
  ok(res, {}, 'Location updated');
}));
router.delete('/locations/:id(\\d+)', wrap(async (req, res) => {
  const r = await query('DELETE FROM locations WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) throw notFound('Location not found');
  await audit.record(req.user.id, 'location.delete', 'location', Number(req.params.id));
  ok(res, {}, 'Location deleted');
}));

// ---- Audit logs, AI usage, weather alerts, settings --------------------------------------
router.get('/audit-logs', wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200), page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const where = [], params = [];
  if (req.query.action) { where.push('l.action LIKE ?'); params.push(`${req.query.action}%`); }
  const [rows, [{ total }]] = await Promise.all([
    query(`SELECT l.id, l.action, l.target_type, l.target_id, l.metadata, l.created_at, u.name AS actor_name, u.role AS actor_role FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]),
    query(`SELECT COUNT(*) AS total FROM audit_logs l ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, params),
  ]);
  ok(res, { logs: rows.map((r) => ({ ...r, metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata })), total, page, limit });
}));

router.get('/ai-usage', wrap(async (_req, res) => {
  const [[summary], byKind, recent] = await Promise.all([
    query('SELECT COUNT(*) AS total, SUM(success = 0) AS failed, ROUND(AVG(latency_ms)) AS avg_latency_ms, SUM(created_at >= (NOW() - INTERVAL 1 DAY)) AS last_24h FROM ai_usage'),
    query('SELECT kind, COUNT(*) AS count, SUM(success = 0) AS failed FROM ai_usage GROUP BY kind ORDER BY count DESC'),
    query('SELECT a.id, a.kind, a.success, a.latency_ms, a.created_at, u.name AS user_name FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 20'),
  ]);
  ok(res, { summary, byKind, recent, aiConfigured: aiService.isConfigured(), model: config.ai.model });
}));

router.get('/weather-alerts', wrap(async (_req, res) => {
  const alerts = await query("SELECT n.id, n.title, n.body, n.created_at, u.id AS farmer_id, u.name AS farmer_name, fp.district, fp.state FROM notifications n JOIN users u ON u.id = n.user_id LEFT JOIN farmer_profiles fp ON fp.user_id = u.id WHERE n.type = 'weather_alert' ORDER BY n.id DESC LIMIT 100");
  ok(res, { alerts, weatherConfigured: weatherService.isConfigured(), jobEveryMinutes: config.weather.alertJobMinutes });
}));
router.post('/weather-alerts/run', wrap(async (req, res) => {
  const result = await weatherJob.run();
  await audit.record(req.user.id, 'weather_alerts.run', 'system', null, result);
  ok(res, result, result.skipped ? `Skipped: ${result.skipped}` : `Checked ${result.checked} farmer(s), sent ${result.alerts} alert(s)`);
}));

router.get('/settings', wrap(async (_req, res) => {
  let redisOk = false, dbOk = false;
  try { redisOk = (await redis.ping()) === 'PONG'; } catch { /* ignore */ }
  try { dbOk = !!(await queryOne('SELECT 1 AS ok')); } catch { /* ignore */ }
  // Only booleans / non-secret identifiers — never keys.
  ok(res, {
    environment: config.env,
    database: { connected: dbOk }, redis: { connected: redisOk },
    ai: { configured: aiService.isConfigured(), model: config.ai.model, embeddingModel: vectorStore.modelName(), provider: new URL(config.ai.baseUrl).host },
    weather: { configured: weatherService.isConfigured(), cacheTtlSeconds: config.weather.cacheTtl, alertJobMinutes: config.weather.alertJobMinutes },
    frontendUrl: config.frontendUrl,
  });
}));

module.exports = router;
