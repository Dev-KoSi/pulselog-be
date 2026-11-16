const { Router } = require('express');
const config = require('../config');
const store = require('../db/store');

const router = Router();

router.get('/', (req, res) => {
  res.json({
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
    lanIp: config.lanIp,
    roster: store.rosterInfo,
    time: new Date().toISOString(),
  });
});

module.exports = router;
