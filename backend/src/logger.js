// Minimal structured logger. Sensitive keys are redacted before anything is written.
const config = require('./config');
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|api[_-]?key|hash/i;

function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 4) return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: config.isProd ? undefined : value.stack };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  return out;
}

function log(level, message, meta) {
  if (config.isTest && level !== 'error') return;
  if (levels[level] > (levels[config.logLevel] ?? 2)) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...(meta ? { meta: redact(meta) } : {}) });
  (level === 'error' ? console.error : console.log)(line);
}

module.exports = {
  error: (m, meta) => log('error', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  info: (m, meta) => log('info', m, meta),
  debug: (m, meta) => log('debug', m, meta),
};
