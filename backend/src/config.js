const required = (name, fallback) => {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
};

const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest,
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  logLevel: process.env.LOG_LEVEL || 'info',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'agrosathi',
    user: required('DB_USER', isTest ? 'agrosathi' : undefined),
    password: required('DB_PASSWORD', isTest ? 'agrosathi' : undefined),
  },
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwt: {
    secret: required('JWT_SECRET', isTest ? 'test-secret-not-for-production' : undefined),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    embeddingModel: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingProvider: process.env.EMBEDDING_PROVIDER || 'local',
    timeoutMs: 30000,
  },
  weather: {
    apiKey: process.env.WEATHER_API_KEY || '',
    cacheTtl: parseInt(process.env.WEATHER_CACHE_TTL_SECONDS || '1800', 10),
    alertJobMinutes: parseInt(process.env.WEATHER_ALERT_JOB_MINUTES || '60', 10),
    timeoutMs: 8000,
  },
};
