const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { ok, wrap, badRequest } = require('../utils/response');
const weatherService = require('../services/weatherService');
const farmerService = require('../services/farmerService');

const router = express.Router();
router.use(authenticate);

async function weatherForFarmer(farmerId) {
  const profile = await farmerService.getProfile(farmerId);
  const crops = await farmerService.getCrops(farmerId);
  const weather = await weatherService.getWeather(profile || {});
  return { weather, alerts: weatherService.buildAlerts(weather, crops) };
}

router.get('/status', (_req, res) => ok(res, { configured: weatherService.isConfigured() }));

router.get('/me', authorize('farmer'), wrap(async (req, res) => ok(res, await weatherForFarmer(req.user.id))));

router.get('/farmer/:id(\\d+)', authorize('agent', 'admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  await farmerService.assertCanAccessFarmer(req.user, id);
  ok(res, await weatherForFarmer(id));
}));

// Ad-hoc lookup, used by the location selector preview: /api/weather?lat=..&lon=.. or ?q=Indore,India
router.get('/', wrap(async (req, res) => {
  const { lat, lon, q } = req.query;
  if (!(lat && lon) && !q) throw badRequest('Provide lat & lon, or q');
  const weather = await weatherService.getWeather({ latitude: lat, longitude: lon, q: q && q.toString().slice(0, 120) });
  ok(res, { weather, alerts: weatherService.buildAlerts(weather) });
}));

module.exports = router;
