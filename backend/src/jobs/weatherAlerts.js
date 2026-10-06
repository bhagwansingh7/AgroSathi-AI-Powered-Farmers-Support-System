// Background job: checks the forecast for each distinct farmer location (one provider call per
// location, thanks to the Redis cache) and creates at most one notification per farmer per alert
// type per day. Skipped entirely when WEATHER_API_KEY is not configured.
const config = require('../config');
const logger = require('../logger');
const { query } = require('../db');
const { redis } = require('../redis');
const weatherService = require('../services/weatherService');
const notifications = require('../services/notificationService');

async function run() {
  if (!weatherService.isConfigured()) return { checked: 0, alerts: 0, skipped: 'weather not configured' };
  const farmers = await query(
    `SELECT u.id, fp.village, fp.district, fp.state, fp.country, fp.latitude, fp.longitude
       FROM users u JOIN farmer_profiles fp ON fp.user_id = u.id
      WHERE u.role = 'farmer' AND u.is_active = 1 AND ((fp.latitude IS NOT NULL AND fp.longitude IS NOT NULL) OR (fp.district IS NOT NULL AND fp.state IS NOT NULL))`);
  const today = new Date().toISOString().slice(0, 10);
  let checked = 0, sent = 0;
  for (const f of farmers) {
    try {
      const crops = await query('SELECT crop_name, expected_harvest_date FROM crops WHERE farmer_id = ?', [f.id]);
      const weather = await weatherService.getWeather(f); // cached per location
      checked++;
      for (const alert of weatherService.buildAlerts(weather, crops)) {
        const key = `walert:${f.id}:${today}:${alert.type}`;
        const first = await redis.set(key, '1', 'EX', 86400, 'NX');
        if (first) {
          await notifications.notify(f.id, { type: 'weather_alert', title: alert.title, body: alert.message.slice(0, 480), link: '/farmer/weather' });
          sent++;
        }
      }
    } catch (err) {
      logger.warn('Weather alert check failed', { farmerId: f.id, message: err.message });
    }
  }
  logger.info('Weather alert job finished', { checked, sent });
  return { checked, alerts: sent };
}

function start() {
  if (!weatherService.isConfigured() || config.isTest) return;
  const every = Math.max(config.weather.alertJobMinutes, 5) * 60 * 1000;
  setTimeout(() => run().catch((e) => logger.error('Weather job error', { error: e })), 30 * 1000);
  setInterval(() => run().catch((e) => logger.error('Weather job error', { error: e })), every);
  logger.info('Weather alert job scheduled', { everyMinutes: every / 60000 });
}

module.exports = { run, start };
