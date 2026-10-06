const Redis = require('ioredis');
const config = require('./config');
const logger = require('./logger');

const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
redis.on('error', (err) => logger.warn('Redis error', { message: err.message }));
redis.on('connect', () => logger.info('Redis connected'));

// Cache helpers never throw: Redis being down must not break the API.
async function cacheGet(key) {
  try {
    const v = await redis.get(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
async function cacheSet(key, value, ttlSeconds) {
  try { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); } catch { /* ignore */ }
}
async function cacheDel(key) {
  try { await redis.del(key); } catch { /* ignore */ }
}

module.exports = { redis, cacheGet, cacheSet, cacheDel };
