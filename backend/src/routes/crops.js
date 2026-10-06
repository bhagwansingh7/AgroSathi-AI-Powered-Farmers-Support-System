const express = require('express');
const { z } = require('zod');
const { query, queryOne } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ok, created, wrap, notFound, badRequest } = require('../utils/response');
const farmerService = require('../services/farmerService');

const router = express.Router();
router.use(authenticate);

const nullable = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable());
const date = nullable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'));
const schema = z.object({
  crop_name: z.string().trim().min(2).max(100),
  variety: nullable(z.string().trim().max(100)).optional(),
  farm_id: nullable(z.coerce.number().int().positive()).optional(),
  category_id: nullable(z.coerce.number().int().positive()).optional(),
  sowing_date: date.optional(),
  expected_harvest_date: date.optional(),
  area: nullable(z.coerce.number().min(0).max(100000)).optional(),
  soil_type: nullable(z.string().trim().max(80)).optional(),
  irrigation_type: nullable(z.string().trim().max(80)).optional(),
  notes: nullable(z.string().trim().max(2000)).optional(),
});

router.get('/categories', wrap(async (_req, res) => ok(res, { categories: await query('SELECT id, name, description FROM crop_categories ORDER BY name') })));

// Farmer: own crops. Agent/admin: ?farmerId=… (agents only for assigned farmers).
router.get('/', wrap(async (req, res) => {
  let farmerId = req.user.id;
  if (req.user.role !== 'farmer') {
    farmerId = Number(req.query.farmerId);
    if (!farmerId) throw badRequest('farmerId is required');
    await farmerService.assertCanAccessFarmer(req.user, farmerId);
  }
  ok(res, { crops: await farmerService.getCrops(farmerId) });
}));

async function assertOwnFarm(farmerId, farmId) {
  if (!farmId) return;
  if (!(await queryOne('SELECT id FROM farms WHERE id = ? AND farmer_id = ?', [farmId, farmerId]))) throw badRequest('Farm does not belong to you');
}

const cols = ['crop_name', 'variety', 'farm_id', 'category_id', 'sowing_date', 'expected_harvest_date', 'area', 'soil_type', 'irrigation_type', 'notes'];

router.post('/', authorize('farmer'), validate(schema), wrap(async (req, res) => {
  await assertOwnFarm(req.user.id, req.body.farm_id);
  const r = await query(`INSERT INTO crops (farmer_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`, [req.user.id, ...cols.map((c) => req.body[c] ?? null)]);
  created(res, { crop: await queryOne('SELECT * FROM crops WHERE id = ?', [r.insertId]) }, 'Crop added');
}));

router.put('/:id(\\d+)', authorize('farmer'), validate(schema), wrap(async (req, res) => {
  await assertOwnFarm(req.user.id, req.body.farm_id);
  const r = await query(`UPDATE crops SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND farmer_id = ?`, [...cols.map((c) => req.body[c] ?? null), req.params.id, req.user.id]);
  if (!r.affectedRows) throw notFound('Crop not found');
  ok(res, { crop: await queryOne('SELECT * FROM crops WHERE id = ?', [req.params.id]) }, 'Crop updated');
}));

router.delete('/:id(\\d+)', authorize('farmer'), wrap(async (req, res) => {
  const r = await query('DELETE FROM crops WHERE id = ? AND farmer_id = ?', [req.params.id, req.user.id]);
  if (!r.affectedRows) throw notFound('Crop not found');
  ok(res, {}, 'Crop deleted');
}));

module.exports = router;
