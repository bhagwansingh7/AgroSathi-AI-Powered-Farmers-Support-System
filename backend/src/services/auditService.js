const { query } = require('../db');
const logger = require('../logger');

// Never throws: failing to write an audit row must not fail the user's action.
async function record(actorId, action, targetType, targetId, metadata = null, conn) {
  try {
    const run = conn ? (sql, p) => conn.query(sql, p) : query;
    await run('INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES (?,?,?,?,?)', [
      actorId || null, action, targetType || null, targetId || null, metadata ? JSON.stringify(metadata) : null,
    ]);
  } catch (err) {
    logger.error('Audit log write failed', { action, error: err });
  }
}

module.exports = { record };
