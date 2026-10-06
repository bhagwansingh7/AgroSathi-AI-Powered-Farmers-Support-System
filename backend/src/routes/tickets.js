const express = require('express');
const { z } = require('zod');
const { query, queryOne } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ok, created, wrap, notFound, forbidden, badRequest } = require('../utils/response');
const assignmentService = require('../services/assignmentService');
const notifications = require('../services/notificationService');
const audit = require('../services/auditService');
const logger = require('../logger');

const router = express.Router();
router.use(authenticate);

const STATUSES = ['open', 'assigned', 'in_progress', 'waiting_for_farmer', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const CATEGORIES = ['general', 'crop_disease', 'pest_disease', 'irrigation', 'fertilizer', 'harvest', 'weather', 'market', 'other'];

const createSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(5000),
  category: z.enum(CATEGORIES).default('general'),
  priority: z.enum(PRIORITIES).default('medium'),
  crop_id: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().nullable()).optional(),
});
const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  agent_id: z.number().int().positive().nullable().optional(),
});
const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });
const listSchema = z.object({ status: z.enum(STATUSES).optional(), priority: z.enum(PRIORITIES).optional(), agentId: z.coerce.number().int().optional(), farmerId: z.coerce.number().int().optional() });

const TICKET_SQL = `
  SELECT t.*, f.name AS farmer_name, a.name AS agent_name, c.crop_name,
         fp.district AS farmer_district, fp.state AS farmer_state
    FROM tickets t
    JOIN users f ON f.id = t.farmer_id
    LEFT JOIN farmer_profiles fp ON fp.user_id = t.farmer_id
    LEFT JOIN users a ON a.id = t.agent_id
    LEFT JOIN crops c ON c.id = t.crop_id`;

async function loadTicketFor(user, id) {
  const t = await queryOne(`${TICKET_SQL} WHERE t.id = ?`, [id]);
  if (!t) throw notFound('Ticket not found');
  const allowed = user.role === 'admin' || (user.role === 'farmer' && t.farmer_id === user.id) || (user.role === 'agent' && (t.agent_id === user.id || (await assignmentService.agentHasFarmer(user.id, t.farmer_id))));
  if (!allowed) throw forbidden('You do not have access to this ticket');
  return t;
}

router.post('/', authorize('farmer'), validate(createSchema), wrap(async (req, res) => {
  const b = req.body;
  if (b.crop_id && !(await queryOne('SELECT id FROM crops WHERE id = ? AND farmer_id = ?', [b.crop_id, req.user.id]))) throw badRequest('Crop does not belong to you');
  const agent = await assignmentService.getActiveAgent(req.user.id);
  const r = await query('INSERT INTO tickets (farmer_id, agent_id, crop_id, subject, description, category, priority, status) VALUES (?,?,?,?,?,?,?,?)', [
    req.user.id, agent ? agent.id : null, b.crop_id ?? null, b.subject, b.description, b.category, b.priority, agent ? 'assigned' : 'open',
  ]);
  const ticketId = r.insertId;
  logger.info('Ticket created', { ticketId, farmerId: req.user.id, priority: b.priority, assigned: !!agent });

  if (agent) await notifications.notify(agent.id, { type: 'new_ticket', title: 'New ticket', body: `${b.subject} (${b.priority})`, link: '/agent/tickets' });
  if (!agent) await notifications.notifyRole('admin', { type: 'unassigned_ticket', title: 'Unassigned ticket', body: `Ticket #${ticketId} from ${req.user.name} needs an agent.`, link: '/admin/tickets' });
  if (b.priority === 'high' || b.priority === 'urgent') await notifications.notifyRole('admin', { type: 'high_priority_ticket', title: `${b.priority === 'urgent' ? 'Urgent' : 'High'}-priority ticket`, body: `#${ticketId}: ${b.subject}`, link: '/admin/tickets' });

  created(res, { ticket: await queryOne(`${TICKET_SQL} WHERE t.id = ?`, [ticketId]) }, 'Support request created');
}));

router.get('/', validate(listSchema, 'query'), wrap(async (req, res) => {
  const where = [], params = [];
  if (req.user.role === 'farmer') { where.push('t.farmer_id = ?'); params.push(req.user.id); }
  if (req.user.role === 'agent') { where.push('t.agent_id = ?'); params.push(req.user.id); }
  const q = req.query;
  if (q.status) { where.push('t.status = ?'); params.push(q.status); }
  if (q.priority) { where.push('t.priority = ?'); params.push(q.priority); }
  if (q.agentId && req.user.role === 'admin') { where.push('t.agent_id = ?'); params.push(q.agentId); }
  if (q.farmerId && req.user.role !== 'farmer') { where.push('t.farmer_id = ?'); params.push(q.farmerId); }
  const rows = await query(`${TICKET_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY FIELD(t.status,'open','assigned','in_progress','waiting_for_farmer','resolved','closed'), FIELD(t.priority,'urgent','high','medium','low'), t.id DESC LIMIT 500`, params);
  ok(res, { tickets: rows });
}));

router.get('/:id(\\d+)', wrap(async (req, res) => {
  const ticket = await loadTicketFor(req.user, Number(req.params.id));
  const messages = await query('SELECT m.id, m.sender_id, u.name AS sender_name, u.role AS sender_role, m.body, m.created_at FROM ticket_messages m JOIN users u ON u.id = m.sender_id WHERE m.ticket_id = ? ORDER BY m.id', [ticket.id]);
  ok(res, { ticket, messages });
}));

router.patch('/:id(\\d+)', validate(updateSchema), wrap(async (req, res) => {
  const t = await loadTicketFor(req.user, Number(req.params.id));
  const { status, priority, agent_id: agentId } = req.body;
  const sets = [], params = [], changes = {};

  if (status !== undefined && status !== t.status) {
    if (req.user.role === 'farmer' && !['closed'].includes(status)) throw forbidden('Farmers can only close their own tickets');
    sets.push('status = ?'); params.push(status); changes.status = { from: t.status, to: status };
    if (status === 'resolved' || status === 'closed') sets.push('resolved_at = COALESCE(resolved_at, NOW())');
    else sets.push('resolved_at = NULL');
  }
  if (priority !== undefined && priority !== t.priority) {
    if (req.user.role === 'farmer') throw forbidden('Farmers cannot change priority');
    sets.push('priority = ?'); params.push(priority); changes.priority = { from: t.priority, to: priority };
  }
  if (agentId !== undefined && agentId !== t.agent_id) {
    if (req.user.role !== 'admin') throw forbidden('Only admins can reassign tickets');
    if (agentId !== null && !(await queryOne("SELECT id FROM users WHERE id = ? AND role = 'agent' AND is_active = 1", [agentId]))) throw badRequest('Agent not found');
    sets.push('agent_id = ?'); params.push(agentId); changes.agent_id = { from: t.agent_id, to: agentId };
    if (agentId && t.status === 'open' && !changes.status) { sets.push("status = 'assigned'"); }
  }
  if (!sets.length) return ok(res, { ticket: t }, 'No changes');

  await query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`, [...params, t.id]);
  const updated = await queryOne(`${TICKET_SQL} WHERE t.id = ?`, [t.id]);

  if (req.user.role === 'admin') await audit.record(req.user.id, changes.priority ? 'ticket.priority_change' : changes.agent_id ? 'ticket.reassign' : 'ticket.update', 'ticket', t.id, changes);
  if (req.user.role !== 'farmer') await notifications.notify(t.farmer_id, { type: 'ticket_updated', title: 'Ticket updated', body: `"${t.subject}"${changes.status ? ` is now ${changes.status.to.replace(/_/g, ' ')}` : ' was updated'}.`, link: '/farmer/tickets' });
  if (changes.agent_id && changes.agent_id.to) await notifications.notify(changes.agent_id.to, { type: 'new_ticket', title: 'Ticket assigned to you', body: t.subject, link: '/agent/tickets' });
  ok(res, { ticket: updated }, 'Ticket updated');
}));

router.post('/:id(\\d+)/messages', validate(messageSchema), wrap(async (req, res) => {
  const t = await loadTicketFor(req.user, Number(req.params.id));
  if (t.status === 'closed') throw badRequest('Ticket is closed');
  const r = await query('INSERT INTO ticket_messages (ticket_id, sender_id, body) VALUES (?,?,?)', [t.id, req.user.id, req.body.body]);
  // Natural workflow transitions.
  if (req.user.role === 'agent' && ['open', 'assigned'].includes(t.status)) await query("UPDATE tickets SET status = 'in_progress' WHERE id = ?", [t.id]);
  if (req.user.role === 'farmer' && t.status === 'waiting_for_farmer') await query("UPDATE tickets SET status = 'in_progress' WHERE id = ?", [t.id]);
  const recipient = req.user.role === 'farmer' ? t.agent_id : t.farmer_id;
  if (recipient && recipient !== req.user.id) await notifications.notify(recipient, { type: 'ticket_updated', title: `New reply on "${t.subject}"`, body: req.body.body.slice(0, 120), link: req.user.role === 'farmer' ? '/agent/tickets' : '/farmer/tickets' });
  const message = await queryOne('SELECT m.id, m.sender_id, u.name AS sender_name, u.role AS sender_role, m.body, m.created_at FROM ticket_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?', [r.insertId]);
  created(res, { message }, 'Message added');
}));

module.exports = router;
