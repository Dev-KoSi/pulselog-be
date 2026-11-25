// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by their 4 arguments.
module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);

  let message = status >= 500 ? 'Internal server error' : err.message;
  if (err.type === 'entity.too.large') message = 'Upload is too large. Please retake the photo.';

  const body = { error: message };
  if (status < 500 && typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code)) body.code = err.code;
  if (status < 500 && err.details) Object.assign(body, err.details);
  res.status(status).json(body);
};
