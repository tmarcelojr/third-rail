# Seeded bug inventory (spoilers)

This fixture is deliberately broken in ways real Node/Express monoliths are broken. Every bug below is a pattern from a production system the plugin author operates or has debugged. If you are trying the demo unspoiled, stop reading now.

| # | Bug | Where | Runbook item that catches it |
|---|---|---|---|
| 1 | Global `express.json()` runs before the webhook route, destroying the raw body. The handler re-serializes `req.body` and hopes the bytes match what the provider signed. They often will not. | server.js (parser mount), routes/webhooks.js | 1. Raw body before JSON parser |
| 2 | Signature verification failure is logged and then **ignored**: the handler processes the event anyway and always returns 200. Forged webhooks get fulfilled; failed handlers never get retried. | routes/webhooks.js | 3. A webhook that returns 200 on failure will never be retried |
| 3 | A correct, constant-time, replay-window `verifySignature()` exists with passing tests, and has **zero call sites**. The fix that never happened. | utils/verifySignature.js, test/verifySignature.test.js | 2. A verifier with no callers protects nothing |
| 4 | Login and reset have no rate limiter while `/api/search` does. The `strict` limiter tier exists in middleware/rateLimiter.js, exported, imported by nobody. | routes/auth.js, middleware/rateLimiter.js | 7. Rate limit the doors people force |
| 5 | The refund endpoint moves money with no auth middleware while its sibling routes carry `requireAuth`/`requireAdmin`. Added "in a hurry during the 2024 holiday incident." | routes/billing.js | 5. Middleware order is a security property |
| 6 | The webhook signature compare uses `!==` on strings, a timing-unsafe comparison, in the code path that is already bypassed. | routes/webhooks.js | 8. IDs are not secrets (timing-safe comparison rule) |

Bugs 1 through 5 are the demo targets. Bug 6 is a bonus for a thorough review.

Verification that the bugs are real lives in the plugin README (the fixture boots, its tests pass, and the webhook route accepts a deliberately unsigned event).
