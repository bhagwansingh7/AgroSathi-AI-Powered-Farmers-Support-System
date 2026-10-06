const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const config = require('../config');
const { redis } = require('../redis');

// Shared Redis store so limits hold across restarts / multiple backend instances.
function limiter(name, windowMs, max, message) {
  if (config.isTest) return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
    store: new RedisStore({ prefix: `rl:${name}:`, sendCommand: (...args) => redis.call(...args) }),
    passOnStoreError: true,
  });
}

module.exports = {
  globalLimiter: limiter('global', 60 * 1000, 300, 'Too many requests, please slow down'),
  authLimiter: limiter('auth', 15 * 60 * 1000, 30, 'Too many login attempts, try again later'),
  aiLimiter: limiter('ai', 60 * 1000, 15, 'Too many AI requests, please wait a moment'),
};
