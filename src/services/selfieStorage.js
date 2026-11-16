/**
 * Stores selfies as image files (backend/data/uploads/selfies) and returns the URL
 * they're served from. Swap for S3 / Cloud Storage in production; keep the signature.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('../db/store');
const httpError = require('../utils/httpError');

const UPLOAD_ROOT = path.join(DATA_DIR, 'uploads');
const SELFIE_DIR = path.join(UPLOAD_ROOT, 'selfies');
const PUBLIC_PREFIX = '/api/uploads/selfies';
const MAX_BYTES = 2 * 1024 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,(.+)$/s;
const EXTENSIONS = { jpeg: 'jpg', png: 'png', webp: 'webp' };

function isImageDataUrl(value) {
  return typeof value === 'string' && DATA_URL.test(value);
}

/** @returns {Promise<string>} public URL of the saved image */
async function saveSelfie(recordId, dataUrl) {
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw httpError(400, 'selfieImage must be a JPEG, PNG or WebP data URL.');

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_BYTES) throw httpError(413, 'Selfie is too large. Please retake the photo.');

  const fileName = `${recordId}.${EXTENSIONS[match[1]]}`;
  await fs.promises.mkdir(SELFIE_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(SELFIE_DIR, fileName), buffer);
  return `${PUBLIC_PREFIX}/${fileName}`;
}

module.exports = { UPLOAD_ROOT, isImageDataUrl, saveSelfie };
