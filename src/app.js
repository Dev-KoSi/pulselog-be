const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');

const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const healthRouter = require('./routes/health');
const coursesRouter = require('./routes/courses');
const adminRouter = require('./routes/admin');
const studentRouter = require('./routes/student');
const attendanceRouter = require('./routes/attendance');
const { UPLOAD_ROOT } = require('./services/selfieStorage');

const app = express();
// In dev, requests arrive via the Vite proxy on this machine; trust its X-Forwarded-For so
// req.ip is the student's phone (used to rate-limit wrong check-in codes per device).
app.set('trust proxy', config.trustProxy);

app.disable('x-powered-by');
app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((o) => o.trim()),
  }),
);
// Selfies arrive as downscaled base64 JPEGs; 5 MB leaves plenty of headroom.
app.use(express.json({ limit: '5mb' }));
app.use('/api', requestLogger);

app.use('/api/health', healthRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/admin', adminRouter); // NOTE: no auth yet. Add lecturer login before real use.
app.use('/api/student', studentRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/uploads', express.static(UPLOAD_ROOT, { maxAge: '1d', immutable: true }));
app.use('/api', (req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` }));

// Production / single-port demo: serve the built React app and let it handle client-side routes.
const distDir = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use(errorHandler);

module.exports = app;
