import axios from 'axios';

// Same-origin requests (nginx / Vite proxy forward /api to the backend). The JWT lives in an
// HTTP-only cookie, so nothing auth-related is ever stored in JS-accessible storage.
const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 20000 });

export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  if (err.code === 'ECONNABORTED') return 'The request took too long. Please try again.';
  if (!err.response) return 'Cannot reach the server. Check your connection.';
  const d = err.response.data;
  if (d && d.errors && d.errors.length) return d.errors.map((e) => `${e.field ? `${e.field}: ` : ''}${e.message}`).join('; ');
  return (d && d.message) || fallback;
};

// AI answers can take longer than the default timeout.
export const AI_TIMEOUT = 60000;

// Unwrap { success, message, data }.
export const get = (url, config) => api.get(url, config).then((r) => r.data.data);
export const post = (url, body, config) => api.post(url, body, config).then((r) => r.data.data);
export const put = (url, body) => api.put(url, body).then((r) => r.data.data);
export const patch = (url, body) => api.patch(url, body).then((r) => r.data.data);
export const del = (url) => api.delete(url).then((r) => r.data.data);

export default api;
