const logger = require('../logger');
const config = require('../config');

const notFoundHandler = (req, res) => res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'A record with these details already exists' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ success: false, message: 'Referenced record does not exist' });

  const status = err.status || 500;
  if (status >= 500) logger.error('Unhandled error', { path: req.path, method: req.method, error: err });
  const body = { success: false, message: status >= 500 && config.isProd ? 'Internal server error' : err.message || 'Internal server error' };
  if (err.details) body.errors = err.details;
  res.status(status).json(body);
};

module.exports = { notFoundHandler, errorHandler };
