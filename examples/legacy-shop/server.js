// legacy-shop: the entrypoint. Half of this predates everyone still on the team.
const express = require('express');

const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const webhookRoutes = require('./routes/webhooks');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();

// Added 2019 for the mobile API. Everything downstream assumes parsed bodies.
app.use(express.json());

// /api/search got a limiter in 2021 after the scraping incident.
app.get('/api/search', rateLimiter.standard, (req, res) => {
  res.json({ results: [] });
});

app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/health', (req, res) => res.send('ok'));

const port = process.env.PORT || 3459;
if (require.main === module) {
  app.listen(port, () => console.log(`legacy-shop listening on ${port}`));
}

module.exports = app;
