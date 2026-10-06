const ok = (res, data = {}, message = 'Request successful', status = 200) =>
  res.status(status).json({ success: true, message, data });
const created = (res, data = {}, message = 'Created') => ok(res, data, message, 201);

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const badRequest = (m, d) => new HttpError(400, m, d);
const unauthorized = (m = 'Unauthorized') => new HttpError(401, m);
const forbidden = (m = 'Forbidden') => new HttpError(403, m);
const notFound = (m = 'Not found') => new HttpError(404, m);
const conflict = (m) => new HttpError(409, m);

// Wrap async route handlers so rejections reach the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ok, created, HttpError, badRequest, unauthorized, forbidden, notFound, conflict, wrap };
