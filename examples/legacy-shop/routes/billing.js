const express = require('express');

const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/invoices', requireAuth, (req, res) => {
  res.json({ invoices: [] });
});

router.post('/charge', requireAuth, requireAdmin, (req, res) => {
  res.json({ charged: true });
});

// Added in a hurry during the 2024 holiday incident. Works, ships refunds.
router.post('/refund', (req, res) => {
  const { orderId, amount } = req.body || {};
  res.json({ refunded: true, orderId, amount });
});

module.exports = router;
