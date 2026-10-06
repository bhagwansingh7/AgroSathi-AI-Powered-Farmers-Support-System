const { loginAs, ACCOUNTS } = require('./helpers');
const { query } = require('../src/db');

describe('Tickets and agent assignment', () => {
  let admin, farmer9, agent3;

  beforeAll(async () => {
    admin = (await loginAs(ACCOUNTS.admin)).agent;
    farmer9 = (await loginAs(ACCOUNTS.farmer9)).agent;
    agent3 = (await loginAs(ACCOUNTS.agent3)).agent;
    // Make sure Mohan (farmer 9) starts unassigned even if a previous run was interrupted.
    await admin.delete('/api/admin/assignments/9');
  });

  afterAll(async () => {
    await admin.delete('/api/admin/assignments/9');
    await query("DELETE FROM tickets WHERE farmer_id = 9 AND subject LIKE 'JEST %'");
  });

  test('farmer creates a ticket; it stays "open" while no agent is assigned', async () => {
    const res = await farmer9.post('/api/tickets').send({ subject: 'JEST yellow leaves', description: 'Leaves are turning yellow', category: 'crop_disease', priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body.data.ticket.status).toBe('open');
    expect(res.body.data.ticket.agent_id).toBeNull();
  });

  test('ticket input is validated', async () => {
    const res = await farmer9.post('/api/tickets').send({ subject: 'x', description: '', priority: 'extreme' });
    expect(res.status).toBe(400);
  });

  test('admin assigns the farmer; the assignment and the open ticket are persisted in MySQL', async () => {
    const res = await admin.post('/api/admin/assignments').send({ farmerId: 9, agentId: 3 });
    expect(res.status).toBe(200);
    const [row] = await query('SELECT agent_id FROM agent_assignments WHERE farmer_id = 9 AND ended_at IS NULL');
    expect(row.agent_id).toBe(3);
    const [t] = await query("SELECT agent_id, status FROM tickets WHERE farmer_id = 9 AND subject = 'JEST yellow leaves'");
    expect(t).toEqual({ agent_id: 3, status: 'assigned' });
  });

  test('the assigned agent now sees the ticket and the farmer', async () => {
    const tickets = await agent3.get('/api/tickets');
    expect(tickets.body.data.tickets.some((t) => t.subject === 'JEST yellow leaves')).toBe(true);
    expect((await agent3.get('/api/farmers/9')).status).toBe(200);
  });

  test('new tickets are auto-assigned to the farmer\'s agent', async () => {
    const res = await farmer9.post('/api/tickets').send({ subject: 'JEST irrigation timing', description: 'When should I irrigate?', category: 'irrigation' });
    expect(res.body.data.ticket.agent_id).toBe(3);
    expect(res.body.data.ticket.status).toBe('assigned');
  });

  test('agent updates ticket status; farmer cannot change priority', async () => {
    const list = await agent3.get('/api/tickets');
    const ticket = list.body.data.tickets.find((t) => t.subject === 'JEST yellow leaves');
    const upd = await agent3.patch(`/api/tickets/${ticket.id}`).send({ status: 'in_progress' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.ticket.status).toBe('in_progress');
    expect((await farmer9.patch(`/api/tickets/${ticket.id}`).send({ priority: 'low' })).status).toBe(403);
  });

  test('reassignment moves the farmer and revokes the old agent\'s access; admin actions are audited', async () => {
    const res = await admin.post('/api/admin/assignments').send({ farmerId: 9, agentId: 4 });
    expect(res.status).toBe(200);
    expect((await agent3.get('/api/farmers/9')).status).toBe(403);
    const logs = await admin.get('/api/admin/audit-logs?action=assignment');
    expect(logs.body.data.logs.some((l) => l.action === 'assignment.reassign' && l.target_id === 9)).toBe(true);
  });

  test('assigning to the same agent twice is rejected; assigning a non-agent is rejected', async () => {
    expect((await admin.post('/api/admin/assignments').send({ farmerId: 9, agentId: 4 })).status).toBe(400);
    expect((await admin.post('/api/admin/assignments').send({ farmerId: 9, agentId: 5 })).status).toBe(404); // user 5 is a farmer
  });

  test('workload endpoint reports active farmers per agent', async () => {
    const res = await admin.get('/api/admin/assignments');
    expect(res.status).toBe(200);
    const imran = res.body.data.agents.find((a) => a.id === 4);
    expect(imran.active_farmers).toBeGreaterThanOrEqual(2);
  });
});
