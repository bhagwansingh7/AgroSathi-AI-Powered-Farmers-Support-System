const request = require('supertest');
const app = require('../src/app');

// Seed accounts (database/seed.sql). Password for all: Password@123
const PASSWORD = 'Password@123';
const ACCOUNTS = {
  admin: 'admin@agrosathi.dev',
  agent2: 'rahul.agent@agrosathi.dev', // Rahul – assigned to farmers 5 and 7
  agent3: 'meera.agent@agrosathi.dev',
  agent4: 'imran.agent@agrosathi.dev',
  farmer5: 'ramesh@agrosathi.dev',
  farmer9: 'mohan@agrosathi.dev', // unassigned in seed data
};

async function loginAs(email, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.data.user };
}

module.exports = { app, request, loginAs, ACCOUNTS, PASSWORD };
