const httpError = require('./httpError');

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two { lat, lng } points (haversine). */
function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Validate a browser GeolocationPosition-style payload: { lat, lng, accuracy } (accuracy in metres).
 * Returns null when nothing was sent; throws 400 when something malformed was sent.
 */
function parseLocation(input) {
  if (input == null) return null;
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const accuracy = Number(input.accuracy);
  const valid =
    Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    Number.isFinite(lng) && Math.abs(lng) <= 180 &&
    Number.isFinite(accuracy) && accuracy >= 0;
  if (!valid) throw httpError(400, 'location must be { lat, lng, accuracy } from the device GPS.');
  return { lat, lng, accuracy: Math.round(accuracy) };
}

module.exports = { distanceMeters, parseLocation };
