const { loginAs, ACCOUNTS } = require('./helpers');

describe('Role-based access control', () => {
  test('a farmer can never reach admin APIs', async () => {
    const { agent } = await loginAs(ACCOUNTS.farmer5);
    for (const path of ['/api/admin/stats', '/api/admin/users', '/api/admin/audit-logs', '/api/admin/assignments', '/api/knowledge']) {
      expect((await agent.get(path)).status).toBe(403);
    }
  });

  test('an agent cannot reach admin APIs', async () => {
    const { agent } = await loginAs(ACCOUNTS.agent2);
    expect((await agent.get('/api/admin/stats')).status).toBe(403);
    expect((await agent.post('/api/admin/assignments').send({ farmerId: 9, agentId: 2 })).status).toBe(403);
  });

  test('an admin can reach admin APIs', async () => {
    const { agent } = await loginAs(ACCOUNTS.admin);
    const res = await agent.get('/api/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.totals.farmers).toBeGreaterThanOrEqual(5);
  });

  test('farmer-only endpoints reject agents and admins', async () => {
    const { agent } = await loginAs(ACCOUNTS.agent2);
    expect((await agent.get('/api/farmers/me')).status).toBe(403);
    expect((await agent.post('/api/ai/chat').send({ message: 'hello there' })).status).toBe(403);
  });

  test('an agent can only open farmers assigned to them', async () => {
    const { agent } = await loginAs(ACCOUNTS.agent2); // Rahul: farmers 5 and 7
    expect((await agent.get('/api/farmers/5')).status).toBe(200);
    expect((await agent.get('/api/farmers/6')).status).toBe(403); // Sunita belongs to Meera
    expect((await agent.get('/api/weather/farmer/6')).status).toBe(403);
    const list = await agent.get('/api/farmers');
    const ids = list.body.data.farmers.map((f) => f.id).sort();
    expect(ids).toEqual([5, 7]);
  });

  test('an agent cannot read another agent\'s tickets or conversations', async () => {
    const { agent } = await loginAs(ACCOUNTS.agent4); // Imran: farmer 8 only
    expect((await agent.get('/api/tickets/1')).status).toBe(403); // ticket 1 belongs to farmer 5 / Rahul
    expect((await agent.get('/api/conversations/1/messages')).status).toBe(403);
    const mine = await agent.get('/api/tickets');
    expect(mine.body.data.tickets.every((t) => t.agent_id === 4)).toBe(true);
  });

  test('a farmer cannot read another farmer\'s data', async () => {
    const { agent } = await loginAs(ACCOUNTS.farmer5);
    expect((await agent.get('/api/tickets/2')).status).toBe(403); // belongs to farmer 6
    expect((await agent.get('/api/farmers/6')).status).toBe(403);
    expect((await agent.get('/api/conversations/2/messages')).status).toBe(403);
  });
});
