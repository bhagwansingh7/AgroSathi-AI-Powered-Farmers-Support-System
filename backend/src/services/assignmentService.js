const { query, queryOne, withTransaction } = require('../db');
const { badRequest, notFound } = require('../utils/response');
const audit = require('./auditService');
const notifications = require('./notificationService');
const logger = require('../logger');

const getActiveAgent = (farmerId) =>
  queryOne(
    `SELECT u.id, u.name, u.email, u.mobile, ap.specialization, u.is_active AS active, a.assigned_at
       FROM agent_assignments a
       JOIN users u ON u.id = a.agent_id
       LEFT JOIN agent_profiles ap ON ap.user_id = u.id
      WHERE a.farmer_id = ? AND a.ended_at IS NULL`,
    [farmerId]
  );

async function agentHasFarmer(agentId, farmerId) {
  const row = await queryOne('SELECT id FROM agent_assignments WHERE agent_id = ? AND farmer_id = ? AND ended_at IS NULL', [agentId, farmerId]);
  return !!row;
}

async function assertRole(id, role) {
  const u = await queryOne('SELECT id, name, role, is_active FROM users WHERE id = ?', [id]);
  if (!u || u.role !== role) throw notFound(`${role} not found`);
  if (!u.is_active) throw badRequest(`${role} account is disabled`);
  return u;
}

// Assign (or reassign) a farmer to an agent. One active agent per farmer (DB-enforced).
async function assign(farmerId, agentId, actorId) {
  const farmer = await assertRole(farmerId, 'farmer');
  const agent = await assertRole(agentId, 'agent');
  const previous = await getActiveAgent(farmerId);
  if (previous && previous.id === agentId) throw badRequest('Farmer is already assigned to this agent');

  await withTransaction(async (conn) => {
    await conn.query('UPDATE agent_assignments SET ended_at = NOW(), active_farmer_id = NULL WHERE farmer_id = ? AND ended_at IS NULL', [farmerId]);
    await conn.query('INSERT INTO agent_assignments (farmer_id, agent_id, assigned_by, active_farmer_id) VALUES (?,?,?,?)', [farmerId, agentId, actorId, farmerId]);
    await conn.query(
      `INSERT INTO conversations (farmer_id, agent_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE agent_id = VALUES(agent_id)`,
      [farmerId, agentId]
    );
    await conn.query(
      `UPDATE tickets SET agent_id = ?, status = IF(status = 'open', 'assigned', status)
        WHERE farmer_id = ? AND status NOT IN ('resolved','closed')`,
      [agentId, farmerId]
    );
  });

  await audit.record(actorId, previous ? 'assignment.reassign' : 'assignment.create', 'user', farmerId, {
    farmer: farmer.name, agent_id: agentId, agent: agent.name, previous_agent_id: previous ? previous.id : null,
  });
  logger.info('Assignment changed', { farmerId, agentId, previousAgentId: previous ? previous.id : null, actorId });

  await notifications.notify(farmerId, { type: 'agent_assigned', title: 'Agent assigned', body: `${agent.name} is now your agent.`, link: '/farmer/chat' });
  await notifications.notify(agentId, { type: 'farmer_assigned', title: 'New farmer assigned', body: `${farmer.name} has been assigned to you.`, link: '/agent/farmers' });
  if (previous) await notifications.notify(previous.id, { type: 'farmer_unassigned', title: 'Farmer reassigned', body: `${farmer.name} is no longer assigned to you.`, link: '/agent/farmers' });
  return getActiveAgent(farmerId);
}

async function unassign(farmerId, actorId) {
  const farmer = await assertRole(farmerId, 'farmer');
  const previous = await getActiveAgent(farmerId);
  if (!previous) throw badRequest('Farmer has no active agent');
  await withTransaction(async (conn) => {
    await conn.query('UPDATE agent_assignments SET ended_at = NOW(), active_farmer_id = NULL WHERE farmer_id = ? AND ended_at IS NULL', [farmerId]);
    await conn.query('UPDATE conversations SET agent_id = NULL WHERE farmer_id = ?', [farmerId]);
    await conn.query(
      `UPDATE tickets SET agent_id = NULL, status = IF(status = 'assigned', 'open', status)
        WHERE farmer_id = ? AND status NOT IN ('resolved','closed')`,
      [farmerId]
    );
  });
  await audit.record(actorId, 'assignment.remove', 'user', farmerId, { farmer: farmer.name, previous_agent_id: previous.id });
  logger.info('Assignment removed', { farmerId, previousAgentId: previous.id, actorId });
  await notifications.notify(previous.id, { type: 'farmer_unassigned', title: 'Farmer unassigned', body: `${farmer.name} is no longer assigned to you.`, link: '/agent/farmers' });
}

// Workload per agent for the admin assignment screen.
const workload = () =>
  query(
    `SELECT u.id, u.name, u.email, u.is_active, ap.specialization, ap.max_farmers,
            (SELECT COUNT(*) FROM agent_assignments a WHERE a.agent_id = u.id AND a.ended_at IS NULL) AS active_farmers,
            (SELECT COUNT(*) FROM tickets t WHERE t.agent_id = u.id AND t.status IN ('in_progress','waiting_for_farmer')) AS active_tickets,
            (SELECT COUNT(*) FROM tickets t WHERE t.agent_id = u.id AND t.status = 'assigned') AS pending_tickets
       FROM users u LEFT JOIN agent_profiles ap ON ap.user_id = u.id
      WHERE u.role = 'agent'
      ORDER BY u.name`
  );

// Optional helper for future auto-assignment: least-loaded active agent that is under capacity.
// Not wired to any automatic flow — admins stay in control unless they call the suggest endpoint.
async function suggestAgent() {
  const agents = (await workload()).filter((a) => a.is_active && a.active_farmers < (a.max_farmers || 25));
  agents.sort((a, b) => a.active_farmers + a.active_tickets - (b.active_farmers + b.active_tickets));
  return agents[0] || null;
}

module.exports = { getActiveAgent, agentHasFarmer, assign, unassign, workload, suggestAgent };
