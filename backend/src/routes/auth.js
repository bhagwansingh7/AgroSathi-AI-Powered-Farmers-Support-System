const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, queryOne, withTransaction } = require('../db');
const { validate } = require('../middleware/validate');
const { authenticate, signToken, cookieOptions, COOKIE_NAME } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { ok, created, wrap, conflict, unauthorized } = require('../utils/response');
const notifications = require('../services/notificationService');
const logger = require('../logger');

const router = express.Router();
// A real bcrypt hash of a random string, used so "unknown email" takes as long as "wrong password".
const DUMMY_HASH = '$2b$10$Zk3mQ9xLp2VnR8tYw1AbCe.ZplJd6JVhpv.j0emVn1ePgLdInSbmW';

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  mobile: z.string().trim().regex(/^[0-9+\-\s]{7,20}$/, 'Invalid mobile number'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72).regex(/[A-Za-z]/, 'Password needs a letter').regex(/[0-9]/, 'Password needs a number'),
  location: z.string().trim().max(120).optional(), // village / town
  district: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  country: z.string().trim().max(100).default('India'),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) });

const publicUser = (u) => ({ id: u.id, role: u.role, name: u.name, email: u.email, mobile: u.mobile, profile_image: u.profile_image });

router.post('/register', authLimiter, validate(registerSchema), wrap(async (req, res) => {
  const { name, email, mobile, password, location, district, state, country } = req.body;
  if (await queryOne('SELECT id FROM users WHERE email = ?', [email])) throw conflict('An account with this email already exists');
  const hash = await bcrypt.hash(password, 10);
  const userId = await withTransaction(async (conn) => {
    const [r] = await conn.query("INSERT INTO users (role, name, email, mobile, password_hash) VALUES ('farmer', ?, ?, ?, ?)", [name, email, mobile, hash]);
    await conn.query('INSERT INTO farmer_profiles (user_id, village, district, state, country) VALUES (?,?,?,?,?)', [r.insertId, location || null, district, state, country]);
    return r.insertId;
  });
  await notifications.notifyRole('admin', { type: 'new_farmer', title: 'New farmer registered', body: `${name} joined AgroSathi.`, link: '/admin/farmers' });
  logger.info('Farmer registered', { userId });
  const user = { id: userId, role: 'farmer', name, email, mobile, profile_image: null };
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
  created(res, { user: publicUser(user) }, 'Registration successful');
}));

router.post('/login', authLimiter, validate(loginSchema), wrap(async (req, res) => {
  const { email, password } = req.body;
  const user = await queryOne('SELECT id, role, name, email, mobile, profile_image, password_hash, is_active FROM users WHERE email = ?', [email]);
  const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !valid || !user.is_active) {
    logger.warn('Login failed', { email, ip: req.ip });
    throw unauthorized('Invalid email or password');
  }
  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
  logger.info('Login success', { userId: user.id, role: user.role });
  ok(res, { user: publicUser(user) }, 'Login successful');
}));

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  ok(res, {}, 'Logged out');
});

router.get('/me', authenticate, (req, res) => ok(res, { user: publicUser(req.user) }));

module.exports = router;
