/**
 * Create an Error carrying an HTTP status; throw it from any route and errorHandler formats it.
 * `code` is a stable machine-readable reason (e.g. "OUTSIDE_AREA") the client can branch on;
 * `details` are extra JSON fields for the response (e.g. distanceMeters).
 */
module.exports = function httpError(status, message, code, details) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
};
