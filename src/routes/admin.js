const { Router } = require('express');
const QRCode = require('qrcode');

const store = require('../db/store');
const events = require('../services/events');
const { createCourse, getCourseStatus, requireCourse, serializeCourse } = require('../services/courses');
const { buildGeofence } = require('../services/geofence');
const liveCode = require('../services/liveCode');
const { resolveAppBaseUrl } = require('../utils/publicUrl');
const httpError = require('../utils/httpError');

const router = Router();

/** Browsers send Origin on POST; GETs pass ?origin= explicitly. */
const requestOrigin = (req) => (typeof req.query.origin === 'string' ? req.query.origin : req.get('origin'));

const toQrDataUrl = (url) => QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 512 });

// POST /api/admin/courses  { courseCode, courseTitle, lecturerName, date?, durationMinutes?, location?, radiusMeters? }
// location ({ lat, lng, accuracy } from the lecturer's device) turns on the location lock.
router.post('/courses', async (req, res) => {
  const course = createCourse(req.body || {}, resolveAppBaseUrl(requestOrigin(req)));
  res.status(201).json({ course: serializeCourse(course), qrDataUrl: await toQrDataUrl(course.checkInUrl) });
});

// GET /api/admin/courses/:courseId/qr?origin= — QR for the check-in URL as seen from the current network
router.get('/courses/:courseId/qr', async (req, res) => {
  const course = requireCourse(req.params.courseId);
  const checkInUrl = `${resolveAppBaseUrl(requestOrigin(req))}${course.checkInPath}`;
  res.json({ checkInUrl, qrDataUrl: await toQrDataUrl(checkInUrl) });
});

// GET /api/admin/courses/:courseId/live-code?origin= — the rotating code + QR URL to project right now
router.get('/courses/:courseId/live-code', (req, res) => {
  const course = requireCourse(req.params.courseId);
  const baseUrl = `${resolveAppBaseUrl(requestOrigin(req))}${course.checkInPath}`;
  if (!course.liveCode || getCourseStatus(course) !== 'active') {
    return res.json({ code: null, checkInUrl: baseUrl, expiresAt: null, windowSeconds: null, serverTime: new Date().toISOString() });
  }
  const live = liveCode.currentCode(course);
  res.set('Cache-Control', 'no-store');
  res.json({ ...live, checkInUrl: `${baseUrl}?t=${live.code}` });
});

// PATCH /api/admin/courses/:courseId/location  { location, radiusMeters? } | { location: null }
// Re-pin the lock where the lecturer is now (e.g. from their phone in the hall), or turn it off.
router.patch('/courses/:courseId/location', (req, res) => {
  const course = requireCourse(req.params.courseId);
  const body = req.body || {};
  if (!('location' in body)) throw httpError(400, 'Send { location, radiusMeters } or { location: null }.');
  const geofence = body.location === null ? null : buildGeofence({ radiusMeters: course.geofence?.radiusMeters, ...body });
  const updated = store.updateCourse(course.id, { geofence });
  res.json({ course: serializeCourse(updated) });
});

// PATCH /api/admin/courses/:courseId/close — end check-in early
router.patch('/courses/:courseId/close', (req, res) => {
  const course = requireCourse(req.params.courseId);
  if (getCourseStatus(course) === 'closed') throw httpError(409, 'Course session is already closed.');
  const updated = store.updateCourse(course.id, { closedAt: new Date().toISOString() });
  res.json({ course: serializeCourse(updated) });
});

// GET /api/admin/attendance/:courseId — every check-in for one course session
router.get('/attendance/:courseId', (req, res) => {
  const course = requireCourse(req.params.courseId);
  const records = store.listAttendance(course.id);
  res.json({ course: serializeCourse(course), count: records.length, records, rejections: store.listRejections(course.id) });
});

// GET /api/admin/attendance/:courseId/stream — Server-Sent Events for the live dashboard log
router.get('/attendance/:courseId/stream', (req, res) => {
  const course = requireCourse(req.params.courseId);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('snapshot', store.listAttendance(course.id));
  send('rejections', store.listRejections(course.id));

  // 'checkin' (verified record) and 'rejection' (blocked by the location lock)
  const unsubscribe = events.onCourseEvent(course.id, (type, data) => send(type, data));
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

module.exports = router;
