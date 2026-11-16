/**
 * Rotating QR codes + check-in tickets (anti-sharing).
 *
 * The projector shows a 6-digit code that changes every WINDOW_SECONDS (TOTP-style:
 * HMAC of the course id and the current time window). The QR carries it as ?t=, and
 * students who type the session code instead are asked for it. A photo or forwarded
 * link of the QR stops working after ACCEPTED_WINDOWS windows.
 *
 * Because a student may then spend a few minutes on the index number + selfie, a
 * valid code is exchanged once for a signed ticket (TICKET_TTL_MS) that the later
 * steps present instead. Both are stateless: signed with the server secret.
 */
const crypto = require('node:crypto');
const store = require('../db/store');
const httpError = require('../utils/httpError');

const WINDOW_SECONDS = 30;
/** Current window + 2 previous: a code works for 60–90 s after it first appears. */
const ACCEPTED_WINDOWS = 3;
const TICKET_TTL_MS = 10 * 60_000;

const hmac = (data) => crypto.createHmac('sha256', store.signingSecret).update(data).digest();
const windowAt = (ms) => Math.floor(ms / 1000 / WINDOW_SECONDS);

function codeForWindow(courseId, window) {
  const digest = hmac(`code:${courseId}:${window}`);
  // RFC 4226 dynamic truncation → 6 digits.
  const offset = digest[digest.length - 1] & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}

/** The code on the projector right now, and when it changes. */
function currentCode(course, now = Date.now()) {
  const window = windowAt(now);
  return {
    code: codeForWindow(course.id, window),
    windowSeconds: WINDOW_SECONDS,
    expiresAt: new Date((window + 1) * WINDOW_SECONDS * 1000).toISOString(),
    serverTime: new Date(now).toISOString(),
  };
}

const sameDigits = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function isCodeValid(course, code, now = Date.now()) {
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const window = windowAt(now);
  let ok = false;
  // Check every accepted window (no early exit) so timing doesn't reveal which one matched.
  for (let i = 0; i < ACCEPTED_WINDOWS; i += 1) ok = sameDigits(clean, codeForWindow(course.id, window - i)) || ok;
  return ok;
}

// --- Tickets ---------------------------------------------------------------------

function issueTicket(course, now = Date.now()) {
  const expiresAt = now + TICKET_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ c: course.id, e: expiresAt })).toString('base64url');
  const sig = hmac(`ticket:${payload}`).toString('base64url');
  return { ticket: `${payload}.${sig}`, expiresAt: new Date(expiresAt).toISOString() };
}

/** Throws 401 TICKET_INVALID / TICKET_EXPIRED unless `ticket` was issued for this course and is fresh. */
function requireTicket(course, ticket, now = Date.now()) {
  const invalid = () =>
    httpError(401, 'Scan the QR code on the projector again to check in.', 'TICKET_INVALID');
  if (typeof ticket !== 'string' || !ticket.includes('.')) throw invalid();
  const [payload, sig] = ticket.split('.');
  const expected = hmac(`ticket:${payload}`).toString('base64url');
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw invalid();
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (data.c !== course.id) throw invalid();
  if (!(data.e > now)) {
    throw httpError(401, 'Your check-in took too long. Scan the QR code on the projector again.', 'TICKET_EXPIRED');
  }
}

// --- Brute-force guard for typed codes ------------------------------------------

const MAX_WRONG_CODES = 8;
const WRONG_CODE_WINDOW_MS = 5 * 60_000;
const wrongCodes = new Map(); // `${ip}|${courseId}` → { count, resetAt }

function guardAttempts(key, now = Date.now()) {
  const entry = wrongCodes.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_WRONG_CODES) {
    throw httpError(429, 'Too many wrong codes. Wait a few minutes, then scan the QR code instead.', 'TOO_MANY_ATTEMPTS');
  }
}

function recordWrongCode(key, now = Date.now()) {
  const entry = wrongCodes.get(key);
  if (!entry || entry.resetAt <= now) wrongCodes.set(key, { count: 1, resetAt: now + WRONG_CODE_WINDOW_MS });
  else entry.count += 1;
  if (wrongCodes.size > 5000) {
    for (const [k, v] of wrongCodes) if (v.resetAt <= now) wrongCodes.delete(k);
  }
}

module.exports = {
  WINDOW_SECONDS,
  ACCEPTED_WINDOWS,
  currentCode,
  isCodeValid,
  issueTicket,
  requireTicket,
  guardAttempts,
  recordWrongCode,
};
