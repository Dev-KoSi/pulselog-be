/**
 * MOCK facial verification for the pitch demo.
 *
 * Replace verifyFace() with a real provider (e.g. AWS Rekognition CompareFaces,
 * Azure Face, or face-api.js on the server) that compares the selfie against the
 * student's enrolled photo and runs a liveness check. Keep the return shape.
 */

const MIN_BYTES = 2_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ selfieImage: string, student: { indexNumber: string } }} input
 * @returns {Promise<{ verified: boolean, confidence: number, provider: string, reason?: string }>}
 */
async function verifyFace({ selfieImage }) {
  await sleep(600); // feels like a real model call during the demo

  const base64 = selfieImage.slice(selfieImage.indexOf(',') + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes < MIN_BYTES) {
    return { verified: false, confidence: 0, provider: 'mock', reason: 'image too small or blank' };
  }

  const confidence = Number((0.86 + Math.random() * 0.13).toFixed(3));
  return { verified: true, confidence, provider: 'mock' };
}

module.exports = { verifyFace };
