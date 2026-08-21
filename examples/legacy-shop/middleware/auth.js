// Demo-grade auth. The real system uses JWTs; the shape is what matters here.
function requireAuth(req, res, next) {
  if (req.get('Authorization') === 'Bearer demo-token') return next();
  return res.status(401).json({ error: 'auth required' });
}

function requireAdmin(req, res, next) {
  if (req.get('X-Admin') === '1') return next();
  return res.status(403).json({ error: 'admin required' });
}

module.exports = { requireAuth, requireAdmin };
