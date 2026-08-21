// Naive in-memory limiter from 2021. Good enough for a demo, wrong for a fleet.
const hits = new Map();

function limiter(max, windowMs) {
  return function rateLimit(req, res, next) {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, start: now };
    if (now - entry.start > windowMs) {
      entry.count = 0;
      entry.start = now;
    }
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) {
      return res.status(429).json({ error: 'rate limited' });
    }
    next();
  };
}

module.exports = {
  standard: limiter(60, 60000),
  // strict exists for exactly the login/reset case. Note who imports it: nobody.
  strict: limiter(10, 60000)
};
