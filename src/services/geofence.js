/**
 * Location lock: a session remembers where the lecturer was when it was created (or
 * last re-pinned) and only accepts check-ins from phones within its radius.
 *
 * Phone GPS indoors is typically off by 10–50 m, so we allow some margin: the
 * radius plus both devices' reported accuracy, capped at one extra radius. With the
 * default 100 m that's at most 200 m: enough for a big lecture hall, far short of a
 * hostel across campus.
 */
const crypto = require('node:crypto');
const store = require('../db/store');
const events = require('./events');
const { distanceMeters, parseLocation } = require('../utils/geo');
const httpError = require('../utils/httpError');

const RADIUS_OPTIONS = [50, 100, 200];
const DEFAULT_RADIUS = 100;
/** Fixes worse than this (e.g. IP-based guesses) can't tell a lecture hall from a hostel. */
const MAX_STUDENT_ACCURACY = 1000;

function parseRadius(value) {
  if (value == null || value === '') return DEFAULT_RADIUS;
  const radius = Number(value);
  if (!RADIUS_OPTIONS.includes(radius)) {
    throw httpError(400, `radiusMeters must be one of ${RADIUS_OPTIONS.join(', ')}.`);
  }
  return radius;
}

/** Build a course's geofence from { location, radiusMeters }; null when no location was given. */
function buildGeofence(input) {
  const location = parseLocation(input.location);
  if (!location) return null;
  return { ...location, radiusMeters: parseRadius(input.radiusMeters), setAt: new Date().toISOString() };
}

/** What clients may see: never the coordinates (they'd make faking a location easier). */
function publicLock(geofence) {
  if (!geofence) return null;
  return { radiusMeters: geofence.radiusMeters, accuracyMeters: geofence.accuracy, setAt: geofence.setAt };
}

const allowedDistance = (fence, location) =>
  fence.radiusMeters + Math.min(fence.accuracy + location.accuracy, fence.radiusMeters);

const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

/**
 * Throws (and logs the blocked attempt for the lecturer) unless `rawLocation` is inside the
 * course's geofence. Returns { distanceMeters, accuracyMeters } for the attendance record,
 * or null when the course has no location lock.
 */
function enforceGeofence(course, rawLocation, student) {
  const fence = course.geofence;
  if (!fence) return null;

  const location = parseLocation(rawLocation);
  if (!location) {
    throw httpError(403, 'This lecture only accepts check-ins from inside the lecture hall. Allow location access and try again.', 'LOCATION_REQUIRED');
  }
  if (location.accuracy > MAX_STUDENT_ACCURACY) {
    throw httpError(
      403,
      `Your phone could only find your location to within ${formatDistance(location.accuracy)}. Turn on GPS / precise location and try again.`,
      'LOCATION_IMPRECISE',
      { accuracyMeters: location.accuracy },
    );
  }

  const distance = Math.round(distanceMeters(fence, location));
  const allowed = Math.round(allowedDistance(fence, location));
  if (distance > allowed) {
    const rejection = store.insertRejection({
      id: crypto.randomUUID(),
      courseId: course.id,
      indexNumber: student.indexNumber,
      studentName: student.name,
      group: student.group,
      timestamp: new Date().toISOString(),
      reason: 'OUTSIDE_AREA',
      distanceMeters: distance,
      accuracyMeters: location.accuracy,
      allowedMeters: allowed,
    });
    events.emitRejection(course.id, rejection);
    throw httpError(
      403,
      `You appear to be about ${formatDistance(distance)} from the lecture hall. Check-in only works inside the lecture area (${fence.radiusMeters} m). Your lecturer can see this attempt.`,
      'OUTSIDE_AREA',
      { distanceMeters: distance, allowedMeters: allowed },
    );
  }
  return { distanceMeters: distance, accuracyMeters: location.accuracy, allowedMeters: allowed };
}

module.exports = { RADIUS_OPTIONS, DEFAULT_RADIUS, buildGeofence, publicLock, enforceGeofence, parseRadius };
