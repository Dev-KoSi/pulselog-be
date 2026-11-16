const crypto = require('node:crypto');
const { Router } = require('express');

const store = require('../db/store');
const events = require('../services/events');
const { getCourseStatus, requireCourse } = require('../services/courses');
const { verifyFace } = require('../services/faceVerification');
const { enforceGeofence } = require('../services/geofence');
const liveCode = require('../services/liveCode');
const { isImageDataUrl, saveSelfie } = require('../services/selfieStorage');
const httpError = require('../utils/httpError');

const CAPTURE_METHODS = new Set(['camera', 'upload', 'demo-avatar']);

const router = Router();

/** The course, or 410 if check-in is no longer open. courseId may be the id or the route token. */
function requireActiveCourse(courseId) {
  const course = requireCourse(String(courseId ?? ''));
  const status = getCourseStatus(course);
  if (status !== 'active') {
    throw httpError(410, `This lecture session has ${status === 'closed' ? 'been closed' : 'expired'}. Check-in is no longer open.`, 'SESSION_CLOSED');
  }
  return course;
}

function requireRosterStudent(indexNumber) {
  const student = store.findStudent(String(indexNumber ?? ''));
  if (!student) throw httpError(404, `Index number "${indexNumber}" is not on the ${store.rosterInfo.program} roster.`);
  return student;
}

// POST /api/attendance/start  { courseId, code } → { ticket, expiresAt }
// Trades the rotating code from the projector (QR ?t= or typed) for a short-lived check-in ticket.
router.post('/start', (req, res) => {
  const { courseId, code } = req.body || {};
  const course = requireActiveCourse(courseId);
  if (!course.liveCode) return res.json({ ticket: null, expiresAt: null }); // legacy session

  const attemptKey = `${req.ip}|${course.id}`;
  liveCode.guardAttempts(attemptKey);
  if (!liveCode.isCodeValid(course, code)) {
    liveCode.recordWrongCode(attemptKey);
    throw httpError(
      403,
      code ? 'That code has expired or is wrong. Enter the code currently shown on the projector.' : 'Enter the 6-digit code shown on the projector.',
      'CODE_INVALID',
    );
  }
  res.json(liveCode.issueTicket(course));
});

// POST /api/attendance/location-check  { courseId, ticket, indexNumber, location }
// Early, friendly answer before the selfie; /verify enforces the same rule again.
router.post('/location-check', (req, res) => {
  const { courseId, ticket, indexNumber, location } = req.body || {};
  const course = requireActiveCourse(courseId);
  if (course.liveCode) liveCode.requireTicket(course, ticket);
  const student = requireRosterStudent(indexNumber);
  res.json({ location: enforceGeofence(course, location, student) });
});

// POST /api/attendance/verify  { indexNumber, courseId, selfieImage, captureMethod?, ticket?, location? }
// ticket is required for rotating-code sessions, location for location-locked ones.
router.post('/verify', async (req, res) => {
  const { indexNumber, courseId, selfieImage, captureMethod, ticket, location } = req.body || {};
  if (!indexNumber || !courseId || !selfieImage) {
    throw httpError(400, 'indexNumber, courseId and selfieImage are required.');
  }

  const course = requireActiveCourse(courseId);
  if (course.liveCode) liveCode.requireTicket(course, ticket);

  const student = requireRosterStudent(indexNumber);
  if (store.findAttendance(course.id, student.indexNumber)) {
    throw httpError(409, `${student.name} has already checked in for ${course.courseCode}.`);
  }
  const position = enforceGeofence(course, location, student);
  if (!isImageDataUrl(selfieImage)) throw httpError(400, 'selfieImage must be a JPEG, PNG or WebP data URL.');

  const verification = await verifyFace({ selfieImage, student });
  if (!verification.verified) {
    throw httpError(422, `Face verification failed (${verification.reason}). Please retake your selfie.`);
  }

  // Re-check after the async verification step so a double-tap can't log twice.
  if (store.findAttendance(course.id, student.indexNumber)) {
    throw httpError(409, `${student.name} has already checked in for ${course.courseCode}.`);
  }

  const id = crypto.randomUUID();
  const record = store.insertAttendance({
    id,
    courseId: course.id,
    courseCode: course.courseCode,
    indexNumber: student.indexNumber,
    studentName: student.name,
    program: student.program,
    group: student.group,
    timestamp: new Date().toISOString(),
    selfieImageUrl: await saveSelfie(id, selfieImage),
    verificationStatus: 'VERIFIED',
    confidence: verification.confidence,
    // Demo-avatar check-ins stay visibly tagged in the dashboard and CSV.
    captureMethod: CAPTURE_METHODS.has(captureMethod) ? captureMethod : 'unknown',
    // Distance from the lecturer's pinned location (null when the session has no location lock).
    location: position && { distanceMeters: position.distanceMeters, accuracyMeters: position.accuracyMeters },
  });

  events.emitAttendance(course.id, record);
  res.status(201).json({ record });
});

module.exports = router;
