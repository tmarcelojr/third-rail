const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { verifySignature } = require('../utils/verifySignature');

const SECRET = 'whsec_demo_secret';

function sign(rawBody, timestamp) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

test('accepts a valid signature', () => {
  const rawBody = '{"type":"payment.succeeded","id":"evt_1"}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(rawBody, timestamp);
  assert.strictEqual(
    verifySignature({ rawBody, timestamp, signature, secret: SECRET }),
    true
  );
});

test('rejects a tampered payload', () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign('{"amount":100}', timestamp);
  assert.strictEqual(
    verifySignature({ rawBody: '{"amount":999}', timestamp, signature, secret: SECRET }),
    false
  );
});

test('rejects a stale timestamp outside the replay window', () => {
  const rawBody = '{"type":"payment.succeeded"}';
  const timestamp = String(Math.floor(Date.now() / 1000) - 3600);
  const signature = sign(rawBody, timestamp);
  assert.strictEqual(
    verifySignature({ rawBody, timestamp, signature, secret: SECRET }),
    false
  );
});

test('rejects a malformed hex signature', () => {
  const rawBody = '{"type":"payment.succeeded"}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  assert.strictEqual(
    verifySignature({ rawBody, timestamp, signature: 'zz-not-hex', secret: SECRET }),
    false
  );
});
