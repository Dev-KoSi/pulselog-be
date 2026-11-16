const app = require('./src/app');
const config = require('./src/config');
const store = require('./src/db/store');

const server = app.listen(config.port, config.host, () => {
  console.log('\n  Attendance API ready');
  console.log(`  Local:   http://localhost:${config.port}/api/health`);
  console.log(`  Network: http://${config.lanIp}:${config.port}/api/health`);
  console.log(`  Roster:  ${store.rosterInfo.count} ${store.rosterInfo.program} students in ${store.rosterInfo.groups} groups`);
  console.log(`  Mock DB: ${config.persist ? 'in-memory + backend/data/db.json' : 'in-memory only'}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${config.port} is already in use. Stop the other process or run with PORT=<free port>.\n`);
    process.exit(1);
  }
  throw err;
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  store.flush();
  server.close(() => process.exit(0));
  // Long-lived SSE streams would otherwise keep the server open.
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
