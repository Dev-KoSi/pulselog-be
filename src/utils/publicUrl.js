const config = require('../config');

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Base URL that goes into QR codes. Phones can't reach "localhost", so when the
 * lecturer's dashboard runs on localhost we swap in this machine's LAN IP and keep
 * the protocol + port (works for Vite dev, HTTPS dev, and the single-port build).
 *
 * @param {unknown} requestedOrigin  window.location.origin sent by the dashboard
 */
function resolveAppBaseUrl(requestedOrigin) {
  if (config.publicAppUrl) return config.publicAppUrl;

  if (typeof requestedOrigin === 'string' && requestedOrigin) {
    try {
      const url = new URL(requestedOrigin);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        if (LOOPBACK.has(url.hostname)) url.hostname = config.lanIp;
        return url.origin;
      }
    } catch {
      // fall through to the default
    }
  }

  return `http://${config.lanIp}:${config.port}`;
}

module.exports = { resolveAppBaseUrl };
