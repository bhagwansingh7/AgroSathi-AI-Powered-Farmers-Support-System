// Online/offline tracking in Redis. A user can have several tabs open, so we count connections
// and only flip to offline when the last socket closes.
const { redis } = require('../redis');
const { query } = require('../db');

const SET_KEY = 'presence:online';
const COUNT_KEY = (id) => `presence:count:${id}`;

async function connect(userId) {
  const n = await redis.incr(COUNT_KEY(userId));
  await redis.expire(COUNT_KEY(userId), 86400);
  await redis.sadd(SET_KEY, userId);
  return n === 1; // true when the user just came online
}

async function disconnect(userId) {
  const n = await redis.decr(COUNT_KEY(userId));
  if (n <= 0) {
    await redis.del(COUNT_KEY(userId));
    await redis.srem(SET_KEY, userId);
    return true; // went offline
  }
  return false;
}

async function onlineIds() {
  try { return (await redis.smembers(SET_KEY)).map(Number); } catch { return []; }
}
async function isOnline(userId) {
  try { return (await redis.sismember(SET_KEY, userId)) === 1; } catch { return false; }
}
async function onlineAgentCount() {
  const ids = await onlineIds();
  if (!ids.length) return 0;
  const rows = await query("SELECT COUNT(*) AS c FROM users WHERE role = 'agent' AND id IN (?)", [ids]);
  return rows[0].c;
}
// Called on boot: stale counters from a previous crashed process must not show users as online.
async function reset() {
  try {
    const keys = await redis.keys('presence:count:*');
    if (keys.length) await redis.del(keys);
    await redis.del(SET_KEY);
  } catch { /* ignore */ }
}

module.exports = { connect, disconnect, isOnline, onlineIds, onlineAgentCount, reset };
