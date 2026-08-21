const crypto = require('crypto');

// Written during the 2023 security push: constant-time HMAC verification over
// `${timestamp}.${rawBody}` with a replay window. Correct, tested, and ready.
function verifySignature({ rawBody, timestamp, signature, secret, toleranceSeconds = 300 }) {
  if (!rawBody || !timestamp || !signature || !secret) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();

  // Buffer.from(_, 'hex') never throws on malformed hex; it truncates. The
  // length check below is what actually rejects garbage input.
  const given = Buffer.from(signature, 'hex');
  if (given.length !== expected.length) return false;

  return crypto.timingSafeEqual(given, expected);
}

module.exports = { verifySignature };
