const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../logger');
const { queryOne } = require('../db');
const { unauthorized, forbidden } = require('../utils/response');

const COOKIE_NAME = 'agrosathi_token';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd && config.frontendUrl.startsWith('https'),
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

// Verifies the token and re-loads the user so deactivated users / role changes take effect immediately.
async function userFromToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    const e = unauthorized(err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token');
    throw e;
  }
  const user = await queryOne('SELECT id, role, name, email, mobile, profile_image, is_active FROM users WHERE id = ?', [payload.sub]);
  if (!user || !user.is_active) throw unauthorized('Account not found or disabled');
  return user;
}

const authenticate = async (req, _res, next) => {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) throw unauthorized('Authentication required');
    req.user = await userFromToken(token);
    next();
  } catch (err) {
    if (err.status === 401) logger.warn('Authentication failure', { ip: req.ip, path: req.path, reason: err.message });
    next(err);
  }
};

// authorize('admin') or authorize('agent', 'admin')
const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) {
    logger.warn('Authorization denied', { userId: req.user.id, role: req.user.role, path: req.path });
    return next(forbidden('You do not have permission to perform this action'));
  }
  next();
};

module.exports = { authenticate, authorize, signToken, userFromToken, cookieOptions, COOKIE_NAME };
