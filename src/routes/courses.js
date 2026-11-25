const { Router } = require('express');
const store = require('../db/store');
const { requireCourse, serializeCourse } = require('../services/courses');
const { resolveAppBaseUrl } = require('../utils/publicUrl');

const router = Router();

// GET /api/courses — all lecture sessions with live status; ?status=active for open ones only
// ?origin= (the dashboard's window.location.origin) rebuilds each check-in link for the current address.
const baseUrlFor = (req) => (typeof req.query.origin === 'string' ? resolveAppBaseUrl(req.query.origin) : undefined);

router.get('/', (req, res) => {
  const base = baseUrlFor(req);
  let courses = store.listCourses().map((c) => serializeCourse(c, base));
  if (typeof req.query.status === 'string') courses = courses.filter((c) => c.status === req.query.status);
  res.json({ courses });
});

// GET /api/courses/:courseId — one session, by id or route token (used by the student check-in page)
router.get('/:courseId', (req, res) => {
  res.json({ course: serializeCourse(requireCourse(req.params.courseId), baseUrlFor(req)) });
});

module.exports = router;
