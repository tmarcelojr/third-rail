const express = require('express');

const router = express.Router();

// Login is intentionally boring. NOTE: /api/search got a rate limiter in 2021
// after the scraping incident; nobody ever came back to add one here.
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === 'demo@shop.test' && password === 'demo') {
    return res.json({ token: 'demo-token' });
  }
  return res.status(401).json({ error: 'invalid credentials' });
});

router.post('/reset', (req, res) => {
  // fires a reset email in the real system
  res.json({ ok: true });
});

module.exports = router;
