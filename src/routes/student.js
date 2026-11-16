const { Router } = require('express');
const store = require('../db/store');
const httpError = require('../utils/httpError');

const router = Router();

// POST /api/student/lookup  { indexNumber } — confirm who is checking in before the selfie step
router.post('/lookup', (req, res) => {
  const indexNumber = typeof req.body?.indexNumber === 'string' ? req.body.indexNumber.trim() : '';
  if (!indexNumber) throw httpError(400, 'indexNumber is required.');

  const student = store.findStudent(indexNumber);
  if (!student) {
    throw httpError(404, `No ${store.rosterInfo.program} student found with index number "${indexNumber}".`);
  }
  res.json({ student });
});

module.exports = router;
