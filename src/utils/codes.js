const crypto = require('node:crypto');

// No 0/O, 1/I/L: codes are read aloud and typed on phones.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomToken(length = 5) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

/**
 * Unique, human-friendly session code such as "CSM442-7KQ2X".
 * @param {string} courseCode
 * @param {(code: string) => boolean} exists
 */
function generateSessionCode(courseCode, exists) {
  const prefix = String(courseCode).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) || 'LEC';
  let code;
  do {
    code = `${prefix}-${randomToken()}`;
  } while (exists(code));
  return code;
}

module.exports = { generateSessionCode, randomToken };
