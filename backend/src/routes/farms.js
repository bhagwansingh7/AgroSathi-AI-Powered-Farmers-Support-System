const express = require('express');
const { z } = require('zod');
const { query, queryOne } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ok, created, wrap, notFound } = require('../utils/response');

const router = express.Router();
router.use(authenticate, authorize('farmer'));

const nullable = (s) => z.preprocess((v) => (v === '' ? null : v), s.nullable());
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  area: nullable(z.coerce.number().min(0).max(100000)).optional(),
  area_unit: z.enum(['acre', 'hectare', 'bigha']).default('acre'),
  soil_type: nullable(z.string().trim().max(80)).optional(),
  irrigation_type: nullable(z.string().trim().max(80)).optional(),
});

router.get('/', wrap(async (req, res) => ok(res, { farms: await query('SELECT * FROM farms WHERE farmer_id = ? ORDER BY id', [req.user.id]) })));

router.post('/', validate(schema), wrap(async (req, res) => {
  const b = req.body;
  const r = await query('INSERT INTO farms (farmer_id, name, area, area_unit, soil_type, irrigation_type) VALUES (?,?,?,?,?,?)', [req.user.id, b.name, b.area ?? null, b.area_unit, b.soil_type ?? null, b.irrigation_type ?? null]);
  created(res, { farm: await queryOne('SELECT * FROM farms WHERE id = ?', [r.insertId]) }, 'Farm added');
}));

router.put('/:id(\\d+)', validate(schema), wrap(async (req, res) => {
  const b = req.body;
  const r = await query('UPDATE farms SET name=?, area=?, area_unit=?, soil_type=?, irrigation_type=? WHERE id=? AND farmer_id=?', [b.name, b.area ?? null, b.area_unit, b.soil_type ?? null, b.irrigation_type ?? null, req.params.id, req.user.id]);
  if (!r.affectedRows) throw notFound('Farm not found');
  ok(res, { farm: await queryOne('SELECT * FROM farms WHERE id = ?', [req.params.id]) }, 'Farm updated');
}));

router.delete('/:id(\\d+)', wrap(async (req, res) => {
  const r = await query('DELETE FROM farms WHERE id = ? AND farmer_id = ?', [req.params.id, req.user.id]);
  if (!r.affectedRows) throw notFound('Farm not found');
  ok(res, {}, 'Farm deleted');
}));

module.exports = router;
