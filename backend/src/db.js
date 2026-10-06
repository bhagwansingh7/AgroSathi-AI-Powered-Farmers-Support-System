const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: false,
  decimalNumbers: true,
  timezone: 'Z',
});

// All queries are parameterized (placeholders only, never string-built values).
const query = async (sql, params = []) => {
  const [rows] = await pool.query(sql, params);
  return rows;
};
const queryOne = async (sql, params = []) => (await query(sql, params))[0] || null;

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, queryOne, withTransaction };
