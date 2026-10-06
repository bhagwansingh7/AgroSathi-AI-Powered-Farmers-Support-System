const { app, request, loginAs, ACCOUNTS, PASSWORD } = require('./helpers');

const unique = () => `test_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.test`;

describe('Authentication', () => {
  test('registers a farmer, sets an HTTP-only cookie and never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test Farmer', email: unique(), mobile: '9876543210', password: 'Secret123', location: 'Testpur', district: 'Indore', state: 'Madhya Pradesh',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('farmer');
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    const cookie = (res.headers['set-cookie'] || []).join(';');
    expect(cookie).toMatch(/agrosathi_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  test('rejects duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Dup', email: ACCOUNTS.farmer5, mobile: '9876543210', password: 'Secret123', district: 'Indore', state: 'Madhya Pradesh',
    });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('validates registration input', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'x', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('login succeeds with valid credentials and /me works with the cookie', async () => {
    const { agent, user } = await loginAs(ACCOUNTS.farmer5);
    expect(user.email).toBe(ACCOUNTS.farmer5);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.role).toBe('farmer');
  });

  test('login fails with a wrong password or unknown email using the same message', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: ACCOUNTS.farmer5, password: 'WrongPass1' });
    const b = await request(app).post('/api/auth/login').send({ email: 'nobody@example.test', password: PASSWORD });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  test('protected routes require authentication', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/tickets')).status).toBe(401);
  });

  test('rejects an invalid or tampered token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'agrosathi_token=not.a.jwt');
    expect(res.status).toBe(401);
  });

  test('logout clears the cookie', async () => {
    const { agent } = await loginAs(ACCOUNTS.farmer5);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});
