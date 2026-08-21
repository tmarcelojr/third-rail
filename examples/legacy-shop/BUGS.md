# Seeded defect inventory

Reference for the `legacy-shop` fixture. Contains answers for the demo; skip it if you want to run the demo cold.

Each defect below is a pattern taken from production Node/Express code, not an invented example. Every one maps to an item in the `hardening-runbook` skill, which is how the blast-radius agent identifies it.

## Inventory

| ID | Defect | Location | Runbook item |
|---|---|---|---|
| D1 | Global JSON parser mounted before the webhook route, so the raw request body is unavailable for signature verification | `server.js:12`, `routes/webhooks.js:16` | 1. Raw body before JSON parser |
| D2 | Failed signature check logs a warning and continues; handler returns 200 unconditionally | `routes/webhooks.js:22-25`, `:32` | 3. A webhook that returns 200 on failure will never be retried |
| D3 | Correct signature verifier with passing tests and no call sites on any request path | `utils/verifySignature.js`, `test/verifySignature.test.js` | 2. A verifier with no callers protects nothing |
| D4 | Refund route has no authentication middleware; sibling routes on the same router require it | `routes/billing.js:16` (compare `:7`, `:11`) | 5. Middleware order is a security property |
| D5 | Login and password reset have no rate limiter; the `strict` tier exists and is never imported | `routes/auth.js:7`, `:15`, `middleware/rateLimiter.js:25` | 7. Rate limit the doors people force |
| D6 | Webhook signature compared with `!==` rather than a timing-safe comparison | `routes/webhooks.js:22` | 8. IDs are not secrets |

D1 through D5 are the demo targets. D6 sits on an already-bypassed code path and is included for reviews that go deeper.

## Detail

**D1.** `app.use(express.json())` at `server.js:12` runs before the webhook router is mounted at `:21`, so `express.raw()` is never reached for that route. The handler compensates by re-serializing `req.body` (`routes/webhooks.js:16`), which produces a different byte sequence than the provider signed whenever key order, whitespace, or unicode escaping differs.

**D2.** The mismatch branch at `routes/webhooks.js:22` writes a warning and falls through to normal processing. The response at `:32` is always 200, so the provider treats every delivery as accepted, including ones the handler failed to process. Two consequences: forged events are fulfilled, and genuine failures are never retried.

**D3.** `utils/verifySignature.js` implements constant-time comparison with a replay window and is covered by four passing tests. `grep -rn "verifySignature" --include="*.js" .` returns only the definition and the test file. The control exists and does not run.

**D4.** `POST /refund` at `routes/billing.js:16` takes no middleware. `GET /invoices` at `:7` requires `requireAuth`; `POST /charge` at `:11` requires `requireAuth` and `requireAdmin`. The refund route moves money with less protection than the route that lists invoices.

**D5.** `middleware/rateLimiter.js` exports two tiers. `standard` is applied to `/api/search` in `server.js`. `strict`, at `:25`, is defined for endpoints subject to credential attacks and is imported nowhere.

**D6.** `signature !== expected` at `routes/webhooks.js:22` compares strings directly. The correct comparison is `crypto.timingSafeEqual` on buffers of equal length, as implemented in `utils/verifySignature.js`.

## Verifying the defects are real

The fixture boots and its own tests pass, so the defects are not the result of broken code:

```bash
npm install
npm test          # 4 passing
npm start
```

With the server running:

```bash
# D1, D2: unsigned event is accepted and acknowledged
curl -s -X POST localhost:3459/api/webhooks/payments \
  -H 'Content-Type: application/json' \
  -d '{"type":"payment.succeeded","id":"evt_forged"}'
# => {"received":true}

# D4: refund succeeds with no credentials
curl -s -X POST localhost:3459/api/billing/refund \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ord_1","amount":9999}'
# => {"refunded":true,"orderId":"ord_1","amount":9999}

# D4 control: the sibling route rejects the same request
curl -s -X POST localhost:3459/api/billing/charge
# => {"error":"auth required"}
```

```bash
# D3, D5: neither the verifier nor the strict limiter has a call site
grep -rn "verifySignature" --include="*.js" routes/ server.js
grep -rn "strict" --include="*.js" routes/ server.js
```
