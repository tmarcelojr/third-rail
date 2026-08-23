# Seeded defect inventory

Reference for the `legacy-shop` fixture. Contains answers for the demo; skip it if you want to run the demo cold.

Each defect below is a pattern taken from production Node/Express code, not an invented example. Five of the six map to an item in the `hardening-runbook` skill, which is how the blast-radius agent identifies them. The sixth deliberately maps to nothing, for the reason given under D6.

## Summary

| ID | Defect | Runbook item |
|:---|:---|:---|
| D1 | Raw body destroyed before signature check | 1 |
| D2 | Failed signature check does not stop processing | 3 |
| D3 | Signature verifier has no call sites | 2 |
| D4 | Refund route has no authentication | 5 |
| D5 | Login and reset have no rate limiter | 7 |
| D6 | Timing-unsafe signature comparison | none, deliberately |

D1 through D4 are the demo's direct targets, each with a runbook item behind it. D5 sits outside the blast radius of a billing-and-webhook change: expect it to surface only as an "Adjacent, not reviewed" line unless you point the reviewer at `routes/auth.js`. D6 has no runbook item on purpose: it is there to separate a reviewer that matches a checklist from one that reads the code.

## What a correct demo run's guard table shows

Three rows, fixed by the agent's two membership rules (guards invoked by radius routes, plus zero-call-site guards defined in `.third-rail.json`-listed files):

| Guard | State |
|:---|:---|
| `requireAuth` | wired, untested (call sites `routes/billing.js:7`, `:11`; no test exercises those routes) |
| `requireAdmin` | wired, untested (call site `routes/billing.js:11`) |
| `verifySignature` | claimed only (defined `utils/verifySignature.js:5`, zero live call sites) |

`rateLimiter.standard` stays out: it has a live call site, but not on a radius route, and it is not zero-call-site. `rateLimiter.strict` stays out: zero call sites, but `middleware/rateLimiter.js` is not a listed sensitive path, so it surfaces through D5's adjacent line instead of the table.

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

Searching the request path for callers returns nothing at all: the only mentions anywhere are the definition and its test. The control exists and does not run.

### D4. Refund route has no authentication

**Location:** `routes/billing.js:16`
**Runbook item 5:** Middleware order and coverage are security properties

`POST /refund` at `:16` takes no middleware. Its siblings on the same router do: `GET /invoices` at `:7` requires `requireAuth`, and `POST /charge` at `:11` requires `requireAuth` and `requireAdmin`.

The route that moves money out is less protected than the route that lists invoices.

### D5. Login and reset have no rate limiter

**Location:** `routes/auth.js:7`, `:15`, `middleware/rateLimiter.js:25`
**Runbook item 7:** Rate limit the doors people force

`middleware/rateLimiter.js` exports two tiers. `standard` is applied to `/api/search` in `server.js`.

`strict` at `:25` is defined for endpoints subject to credential attacks. It is imported nowhere.

### D6. Timing-unsafe signature comparison

**Location:** `routes/webhooks.js:22`
**Runbook item:** none. This one is here to be caught without a rule for it.

The nine runbook items are one org's scar tissue, which is never the complete set of ways this code can fail. No item covers timing-safe comparison of webhook signatures: item 7's timing concern is bcrypt short-circuit account enumeration, and item 8's `timingSafeEqual` rule is about capability-URL tokens. A reviewer that only matches the checklist will miss D6 entirely. A reviewer that reasons about the code should report it under "Findings the runbook does not cover," which is the section that tells an org what its runbook is missing.

`signature !== expected` compares strings character by character and returns at the first difference. One honesty note: D2 already discards the comparison's result, so this timing channel is unreachable until D2 is fixed. The right report calls it latent, a defense-in-depth fix to make alongside D2, not a live oracle.

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

D6 is confirmed by reading: `routes/webhooks.js:22` compares the signature with `!==` on strings.
