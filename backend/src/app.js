const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const logger = require('./logger');
const { ok } = require('./utils/response');
const { notFoundHandler, errorHandler } = require('./middleware/error');
const { globalLimiter } = require('./middleware/rateLimit');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind the nginx container

app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Request logging (method, path, status, duration). No bodies, headers or cookies are logged.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health') return;
    logger.info('request', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start, userId: req.user ? req.user.id : undefined });
  });
  next();
});

app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }));
app.use('/api', globalLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/farmers', require('./routes/farmers'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/farms', require('./routes/farms'));
app.use('/api/crops', require('./routes/crops'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/weather', require('./routes/weather'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/knowledge', require('./routes/knowledge'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
