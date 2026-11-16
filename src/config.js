const os = require('node:os');

const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|vmnet|vboxnet|tailscale|zt|utun|lo)/i;

/** First non-internal IPv4 address, so phones on the same Wi-Fi can reach the demo. */
function getLanIp() {
  const nets = os.networkInterfaces();
  for (const [name, addresses] of Object.entries(nets)) {
    if (VIRTUAL_INTERFACE.test(name)) continue;
    for (const net of addresses || []) {
      const isV4 = net.family === 'IPv4' || net.family === 4;
      if (isV4 && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

/**
 * Express "trust proxy": which proxies may set X-Forwarded-For, so req.ip is the student's device.
 * Default "loopback" fits local dev (Vite proxy). Behind a host's load balancer (Render, Railway,
 * Fly, Heroku…) use 1 (one proxy hop) or true.
 */
function parseTrustProxy(value) {
  const v = (value || '').trim();
  if (!v) return 'loopback';
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'true' || v === 'false') return v === 'true';
  return v; // e.g. "loopback, 10.0.0.0/8"
}

const config = {
  port: Number(process.env.PORT) || 5000,
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  publicAppUrl: (process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, ''),
  persist: process.env.PERSIST !== 'false',
  defaultSessionMinutes: Number(process.env.DEFAULT_SESSION_MINUTES) || 90,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  lanIp: getLanIp(),
};

module.exports = config;
