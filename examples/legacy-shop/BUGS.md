# Seeded defect inventory

Reference for the `legacy-shop` fixture. Contains answers for the demo; skip it if you want to run the demo cold.

Each defect below is a pattern taken from production Node/Express code, not an invented example. Every one maps to an item in the `hardening-runbook` skill, which is how the blast-radius agent identifies it.

## Summary

| ID | Defect | Runbook item |
|:---|:---|:---|
| D1 | Raw body destroyed before signature check | 1 |
| D2 | Failed signature check does not stop processing | 3 |
| D3 | Signature verifier has no call sites | 2 |
| D4 | Refund route has no authentication | 5 |
| D5 | Login and reset have no rate limiter | 7 |
| D6 | Timing-unsafe signature comparison | 8 |

D1 through D5 are the demo targets. D6 sits on an already-bypassed code path and is included for reviews that go deeper.

---

### D1. Raw body destroyed before signature check

**Location:** `server.js:12`, `routes/webhooks.js:16`
**Runbook item 1:** Raw body before JSON parser

`app.use(express.json())` at `server.js:12` runs before the webhook router is mounted at `:21`, so `express.raw()` is never reached for that route.

The handler compensates by re-serializing `req.body` at `routes/webhooks.js:16`. That produces a different byte sequence than the provider signed whenever key order, whitespace, or unicode escaping differs, so verification fails on payloads that are entirely legitimate.

### D2. Failed signature check does not stop processing

**Location:** `routes/webhooks.js:22-25`, `:32`
**Runbook item 3:** A webhook that returns 200 on failure will never be retried

The mismatch branch at `:22` writes a warning and falls through to normal processing. The response at `:32` is always 200, so the provider treats every delivery as accepted, including ones the handler failed to process.

Two consequences: forged events are fulfilled, and genuine failures are never retried.

### D3. Signature verifier has no call sites

**Location:** `utils/verifySignature.js`, `test/verifySignature.test.js`
**Runbook item 2:** A verifier with no callers protects nothing

`utils/verifySignature.js` implements constant-time comparison with a replay window, and four tests cover it. All four pass.

Searching the request path for callers returns only the definition and the test file. The control exists and does not run.

### D4. Refund route has no authentication

**Location:** `routes/billing.js:16`
**Runbook item 5:** Middleware order is a security property

`POST /refund` at `:16` takes no middleware. Its siblings on the same router do: `GET /invoices` at `:7` requires `requireAuth`, and `POST /charge` at `:11` requires `requireAuth` and `requireAdmin`.

The route that moves money out is less protected than the route that lists invoices.

### D5. Login and reset have no rate limiter

**Location:** `routes/auth.js:7`, `:15`, `middleware/rateLimiter.js:25`
**Runbook item 7:** Rate limit the doors people force

`middleware/rateLimiter.js` exports two tiers. `standard` is applied to `/api/search` in `server.js`.

`strict` at `:25` is defined for endpoints subject to credential attacks. It is imported nowhere.

### D6. Timing-unsafe signature comparison

**Location:** `routes/webhooks.js:22`
**Runbook item 8:** IDs are not secrets

`signature !== expected` compares strings directly, which returns as soon as it finds a differing character.

The correct comparison is `crypto.timingSafeEqual` on buffers of equal length, which is what `utils/verifySignature.js` already does.

---

## Verifying the defects are real

The fixture boots and its own tests pass, so none of this is the result of broken code:

```bash
npm install
npm test          # 4 passing
npm start
```

With the server running, D1, D2, and D4 are observable directly:

```bash
# Unsigned event is accepted and acknowledged
curl -s -X POST localhost:3459/api/webhooks/payments \
  -H 'Content-Type: application/json' \
  -d '{"type":"payment.succeeded","id":"evt_forged"}'
# => {"received":true}

# Refund succeeds with no credentials
curl -s -X POST localhost:3459/api/billing/refund \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ord_1","amount":9999}'
# => {"refunded":true,"orderId":"ord_1","amount":9999}

# The sibling route rejects the same unauthenticated request
curl -s -X POST localhost:3459/api/billing/charge
# => {"error":"auth required"}
```

D3 and D5 are absences, so they are confirmed by search returning nothing:

```bash
grep -rn "verifySignature" --include="*.js" routes/ server.js
grep -rn "strict" --include="*.js" routes/ server.js
```
