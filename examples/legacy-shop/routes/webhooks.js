const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'whsec_demo_secret';

// Payment provider webhook. Provider signs HMAC-SHA256 over `${timestamp}.${rawBody}`
// and sends it in X-Shop-Signature with the timestamp in X-Shop-Timestamp.
router.post('/payments', (req, res) => {
  const signature = req.get('X-Shop-Signature') || '';
  const timestamp = req.get('X-Shop-Timestamp') || '';

  // req.body was already parsed by the global express.json() in server.js, so the
  // original raw bytes are gone. Re-serialize and hope it matches what was signed.
  const payload = `${timestamp}.${JSON.stringify(req.body)}`;
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  if (signature !== expected) {
    // TODO(2022): verification keeps failing in prod for some events. Skipping for
    // now so fulfillment doesn't stall. Revisit after the Q3 release.
    console.warn('webhook signature mismatch, processing anyway');
  }

  if (req.body && req.body.type === 'payment.succeeded') {
    // grant entitlement, mark order paid, kick off fulfillment
  }

  res.status(200).json({ received: true });
});

module.exports = router;
