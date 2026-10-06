const { badRequest } = require('../utils/response');

// validate(schema, 'body' | 'query' | 'params') — replaces the input with the parsed (stripped, coerced) value.
const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(badRequest('Validation failed', details));
  }
  req[source] = result.data;
  next();
};

module.exports = { validate };
