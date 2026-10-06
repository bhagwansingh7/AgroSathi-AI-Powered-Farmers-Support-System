const { query, queryOne } = require('../db');
const { forbidden } = require('../utils/response');
const { agentHasFarmer } = require('./assignmentService');

const PROFILE_SQL = `
  SELECT u.id, u.name, u.email, u.mobile, u.profile_image, u.is_active, u.created_at,
         fp.village, fp.district, fp.state, fp.country, fp.latitude, fp.longitude,
         fp.farm_size, fp.farm_size_unit, fp.soil_type, fp.irrigation_type, fp.updated_at
    FROM users u LEFT JOIN farmer_profiles fp ON fp.user_id = u.id
   WHERE u.id = ? AND u.role = 'farmer'`;

const getProfile = (farmerId) => queryOne(PROFILE_SQL, [farmerId]);
const getCrops = (farmerId) =>
  query(
    `SELECT c.*, f.name AS farm_name, cc.name AS category
       FROM crops c LEFT JOIN farms f ON f.id = c.farm_id LEFT JOIN crop_categories cc ON cc.id = c.category_id
      WHERE c.farmer_id = ? ORDER BY c.created_at DESC`,
    [farmerId]
  );

// Central access rule: admin -> any farmer; agent -> only currently assigned farmers; farmer -> self.
async function assertCanAccessFarmer(user, farmerId) {
  if (user.role === 'admin') return;
  if (user.role === 'farmer' && user.id === farmerId) return;
  if (user.role === 'agent' && (await agentHasFarmer(user.id, farmerId))) return;
  throw forbidden('You do not have access to this farmer');
}

module.exports = { getProfile, getCrops, assertCanAccessFarmer };
