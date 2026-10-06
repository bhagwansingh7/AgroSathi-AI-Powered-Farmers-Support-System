// Weather integration (WeatherAPI.com). To change provider, only this file needs to change:
// keep returning the normalized shape produced by normalize().
const config = require('../config');
const logger = require('../logger');
const { query, queryOne } = require('../db');
const { cacheGet, cacheSet } = require('../redis');
const { HttpError } = require('../utils/response');

const isConfigured = () => !!config.weather.apiKey;

function locationKeyAndQuery({ latitude, longitude, village, district, state, country, q }) {
  if (latitude != null && longitude != null && latitude !== '' && longitude !== '') {
    const lat = Number(latitude), lon = Number(longitude);
    return { key: `${lat.toFixed(2)},${lon.toFixed(2)}`, q: `${lat},${lon}` };
  }
  const text = q || [village, district, state, country].filter(Boolean).join(', ');
  if (!text) return null;
  return { key: `q:${text.toLowerCase().replace(/\s+/g, ' ')}`, q: text };
}

function normalize(raw) {
  const days = (raw.forecast && raw.forecast.forecastday) || [];
  const labels = ['Today', 'Tomorrow'];
  return {
    location: { name: raw.location.name, region: raw.location.region, country: raw.location.country, localtime: raw.location.localtime },
    current: {
      tempC: raw.current.temp_c,
      feelsLikeC: raw.current.feelslike_c,
      humidity: raw.current.humidity,
      windKph: raw.current.wind_kph,
      cloud: raw.current.cloud,
      precipMm: raw.current.precip_mm,
      condition: raw.current.condition.text,
      icon: raw.current.condition.icon ? `https:${raw.current.condition.icon}`.replace('https:https:', 'https:') : null,
      rainChance: days[0] ? days[0].day.daily_chance_of_rain : null,
    },
    forecast: days.map((d, i) => ({
      date: d.date,
      label: labels[i] || new Date(d.date).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      maxC: d.day.maxtemp_c,
      minC: d.day.mintemp_c,
      chanceOfRain: d.day.daily_chance_of_rain,
      totalPrecipMm: d.day.totalprecip_mm,
      maxWindKph: d.day.maxwind_kph,
      condition: d.day.condition.text,
    })),
  };
}

// General (never prescriptive) agricultural alerts derived from the forecast.
function buildAlerts(weather, crops = []) {
  const alerts = [];
  const f = weather.forecast;
  const soon = f.slice(0, 2);
  const rainy = soon.find((d) => d.chanceOfRain >= 60 || d.totalPrecipMm >= 20);
  if (rainy) {
    const harvestSoon = crops.some((c) => c.expected_harvest_date && (new Date(c.expected_harvest_date) - Date.now()) / 86400000 <= 14);
    alerts.push({
      type: 'rain', severity: rainy.chanceOfRain >= 80 ? 'high' : 'medium',
      title: 'Weather Alert: high probability of rain',
      message: `${rainy.label} has a ${rainy.chanceOfRain}% chance of rain. Consider checking your irrigation plans${harvestSoon ? ' and protecting harvest-ready crops where appropriate' : ''}. You can contact your agent for advice specific to your fields.`,
    });
  }
  const hot = soon.find((d) => d.maxC >= 40);
  if (hot) alerts.push({ type: 'heat', severity: 'medium', title: 'Weather Alert: very hot weather', message: `${hot.label} may reach ${Math.round(hot.maxC)}°C. Crops and workers may be under heat stress; consider asking your agent about irrigation timing.` });
  const cold = soon.find((d) => d.minC <= 4);
  if (cold) alerts.push({ type: 'cold', severity: 'medium', title: 'Weather Alert: cold night expected', message: `${cold.label} may drop to ${Math.round(cold.minC)}°C. Frost-sensitive crops may need attention; ask your agent if unsure.` });
  const windy = soon.find((d) => d.maxWindKph >= 40);
  if (windy) alerts.push({ type: 'wind', severity: 'medium', title: 'Weather Alert: strong winds', message: `${windy.label} may bring winds up to ${Math.round(windy.maxWindKph)} km/h. Spraying and tall crops may be affected.` });
  return alerts;
}

async function fetchFromProvider(q) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(config.weather.apiKey)}&q=${encodeURIComponent(q)}&days=5&aqi=no&alerts=no`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.weather.timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      // Don't log the URL: it contains the API key.
      throw new Error(`Weather provider responded with HTTP ${res.status}`);
    }
    return normalize(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns { ...weather, fetchedAt, cached, stale }.
 * Order: Redis (fresh) -> provider -> MySQL last-known copy (stale) -> 503.
 */
async function getWeather(loc) {
  if (!isConfigured()) throw new HttpError(503, 'Weather is not configured (WEATHER_API_KEY missing)');
  const target = locationKeyAndQuery(loc);
  if (!target) throw new HttpError(400, 'No location available. Please set your location first.');

  const redisKey = `weather:${target.key}`;
  const hit = await cacheGet(redisKey);
  if (hit) return { ...hit, cached: true, stale: false };

  try {
    const weather = await fetchFromProvider(target.q);
    const payload = { ...weather, fetchedAt: new Date().toISOString() };
    await cacheSet(redisKey, payload, config.weather.cacheTtl);
    await query(
      'INSERT INTO weather_cache (location_key, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)',
      [target.key.slice(0, 120), JSON.stringify(payload)]
    );
    return { ...payload, cached: false, stale: false };
  } catch (err) {
    logger.warn('Weather API failure', { location: target.key, message: err.message });
    const row = await queryOne('SELECT payload FROM weather_cache WHERE location_key = ?', [target.key.slice(0, 120)]);
    if (row) {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      return { ...payload, cached: true, stale: true };
    }
    throw new HttpError(503, 'Weather is temporarily unavailable. Other features are not affected.');
  }
}

module.exports = { getWeather, buildAlerts, isConfigured };
