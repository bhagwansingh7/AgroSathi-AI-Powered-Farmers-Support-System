const http = require('http');
const config = require('./config');
const logger = require('./logger');
const app = require('./app');
const { attachSocket } = require('./socket');
const { pool } = require('./db');
const { redis } = require('./redis');
const presence = require('./services/presenceService');
const vectorStore = require('./services/vectorStoreService');
const weatherJob = require('./jobs/weatherAlerts');

const server = http.createServer(app);
attachSocket(server);

async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try { await pool.query('SELECT 1'); return; } catch (err) {
      logger.warn('Waiting for MySQL…', { attempt: i + 1, message: err.message });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('MySQL is not reachable');
}

async function main() {
  await waitForDb();
  await presence.reset();
  server.listen(config.port, () => logger.info(`AgroSathi API listening on :${config.port}`, { env: config.env }));
  // Index seed/admin documents that have no embeddings yet; failures must not stop the API.
  vectorStore.reindexAll().catch((err) => logger.error('Initial knowledge indexing failed', { message: err.message }));
  weatherJob.start();
}

const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => { await pool.end().catch(() => {}); redis.disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', { error: reason }));

main().catch((err) => { logger.error('Fatal startup error', { error: err }); process.exit(1); });
