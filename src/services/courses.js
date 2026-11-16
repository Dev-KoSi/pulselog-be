const crypto = require('node:crypto');
const config = require('../config');
const store = require('../db/store');
const httpError = require('../utils/httpError');
const { generateSessionCode } = require('../utils/codes');
const { buildGeofence, publicLock } = require('./geofence');

const clean = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** @returns {'active' | 'expired' | 'closed'} */
function getCourseStatus(course, now = Date.now()) {
  if (course.closedAt) return 'closed';
  if (now > Date.parse(course.expiresAt)) return 'expired';
  return 'active';
}

/**
 * @param {string} [appBaseUrl]  when given, the check-in link is rebuilt for the address the
 *   dashboard is on now (the saved one may point at a port or network that has since changed)
 */
function serializeCourse(course, appBaseUrl) {
  const { geofence, ...rest } = course;
  return {
    ...rest,
    ...(appBaseUrl ? { checkInUrl: `${appBaseUrl}${course.checkInPath}` } : {}),
    // Sessions created before these features existed have neither.
    liveCode: Boolean(course.liveCode),
    locationLock: publicLock(geofence),
    status: getCourseStatus(course),
    attendanceCount: store.countAttendance(course.id),
  };
}

function requireCourse(idOrToken) {
  const course = idOrToken ? store.findCourse(idOrToken) : null;
  if (!course) throw httpError(404, 'Course session not found. Check the link or code and try again.');
  return course;
}

/**
 * Create a lecture session with a unique route token (e.g. "PSY241-7KQ2X") and the
 * check-in URL students reach by scanning its QR code.
 *
 * @param {{ courseCode?: string, courseTitle?: string, lecturerName?: string, date?: string, durationMinutes?: number,
 *   location?: { lat: number, lng: number, accuracy: number }, radiusMeters?: number }} input
 *   `location` (the lecturer's device position) turns on the location lock.
 * @param {string} appBaseUrl  e.g. http://192.168.1.20:5173
 */
function createCourse(input, appBaseUrl) {
  const courseCode = clean(input.courseCode, 16).toUpperCase();
  const courseTitle = clean(input.courseTitle, 120);
  const lecturerName = clean(input.lecturerName, 80);
  if (courseCode.length < 2) throw httpError(400, 'courseCode is required (e.g. PSY 241).');
  if (!courseTitle) throw httpError(400, 'courseTitle is required.');
  if (!lecturerName) throw httpError(400, 'lecturerName is required.');

  const date = input.date ? String(input.date) : todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw httpError(400, 'date must be in YYYY-MM-DD format.');
  }

  const durationMinutes = Number(input.durationMinutes ?? config.defaultSessionMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 600) {
    throw httpError(400, 'durationMinutes must be between 5 and 600.');
  }

  const geofence = buildGeofence(input);

  const routeToken = generateSessionCode(courseCode, (t) => Boolean(store.findCourse(t)));
  const checkInPath = `/checkin/${routeToken}`;
  const now = new Date();

  return store.insertCourse({
    id: crypto.randomUUID(),
    courseCode,
    courseTitle,
    lecturerName,
    date,
    routeToken,
    checkInPath,
    checkInUrl: `${appBaseUrl}${checkInPath}`,
    durationMinutes: Math.round(durationMinutes),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
    closedAt: null,
    liveCode: true,
    geofence,
  });
}

module.exports = { createCourse, getCourseStatus, requireCourse, serializeCourse };
