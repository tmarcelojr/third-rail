---
name: hardening-runbook
description: Production-hardening runbook for Node/Express payment, webhook, authentication, and session code. Use when adding, editing, or reviewing routes or middleware that touch billing, refunds, Stripe or other payment webhooks, login, password reset, sessions, or auth in an Express codebase, or when a third-rail guard hook has fired on a sensitive path.
---

# Hardening runbook: payment, webhook, and auth paths in Express

This is an org runbook, not general advice. Every item below comes from a bug that shipped in production and cost real money, real data, or real trust. When work touches a sensitive path, check the change against each item. Gotchas first, because the gotcha is the part that ships.

## 1. Raw body before JSON parser

**Gotcha:** a global `app.use(express.json())` mounted before a webhook route destroys the raw request bytes. Handlers that re-serialize `req.body` and verify against that are broken in a way that passes local testing and fails intermittently in production (key order, whitespace, unicode).

**Rule:** webhook routes take `express.raw({ type: 'application/json' })` on that route only, mounted BEFORE any global JSON parser. Signature verification consumes the raw buffer, never a re-serialization.

## 2. A verifier with no callers protects nothing

**Gotcha:** `verifySignature()` exists, is correct, and has passing unit tests. Nothing on the live request path calls it. The tests are evidence the helper works, and zero evidence that it runs.

**Rule:** a control counts as done only with (a) a call site on the live path, cited file:line, and (b) a test that exercises that path. A helper with passing unit tests and zero callers is not a fix.

## 3. A webhook that returns 200 on failure will never be retried

**Gotcha:** the handler catches an error (or shrugs past a failed signature check) and returns 200 anyway. The provider considers the event delivered. Result: charged-but-unfulfilled orders with no retry and no recovery path.

**Rule:** verification failure returns 4xx and stops. Handler failure returns 5xx so the provider retries. Never log-and-continue past a failed signature check.

## 4. Webhook idempotency

**Gotcha:** providers redeliver events. A handler that grants entitlements or ships goods per delivery double-fulfills.

**Rule:** record processed event ids and no-op on replay. Fail open on the dedup lookup only if every handler underneath is independently idempotent, and write that reasoning down.

## 5. Middleware order is a security property

**Gotcha:** reordering `app.use()` lines looks like tidying and is actually a security change. `trust proxy` set to `true` (instead of `1`) lets clients spoof X-Forwarded-For and rotate rate-limit buckets.

**Rule:** `trust proxy` is exactly the number of hops you control, never `true`. Auth runs before entitlement checks. The error handler mounts last. Treat parser and middleware order as part of the security model and review it as such.

## 6. The irreversible claim runs last

**Gotcha:** a fix that claims an entitlement (or charges, or sends) before a later check can still reject burns the customer's purchase with no refund path when that later check throws.

**Rule:** cheap, rejectable checks first; the irreversible claim last; a release path for the throw case in between.

## 7. Rate limit the doors people force

**Gotcha:** the search endpoint got a limiter after the scraping incident; login never did. Also: anti-enumeration dummy bcrypt compares must be a real 60-char hash at the configured cost. A short placeholder string makes bcrypt short-circuit, and the not-found branch returns in about a millisecond, leaking account existence by timing.

**Rule:** login, password reset, and webhook endpoints each get their own limiter tier, not the global one.

## 8. IDs are not secrets

**Gotcha:** Mongo ObjectIds are a timestamp plus a per-process constant plus a counter. One leaked id makes its neighbors enumerable. And a resource cache keyed only by URL hands the next visitor the previous visitor's access token.

**Rule:** capability URLs use `crypto.randomBytes(32)` tokens compared with `timingSafeEqual`, returning 404 (not 403) on miss so a guess is not an existence oracle. Scope every cache entry by owner.

## 9. Boot refuses weak secrets; prod hides stack traces

**Gotcha:** a JWT secret short enough to guess makes every token forgeable, and a stack trace in a production error response is free reconnaissance.

**Rule:** production boot exits on missing or short secrets. A central error handler returns generic errors in prod and is itself covered by a test. Logs print variable names, never values.

## How to verify any fix on these paths

1. Cite the call site (file:line) where the guard runs on the live path.
2. Point to the test that exercises that path, not just the helper.
3. Revert the fix locally and confirm that test fails with the production failure mode, then restore it. If reverting the fix turns nothing red, the test is not covering the fix.

## What this runbook cannot see

It covers change-time discipline on known-dangerous paths. It is not a vulnerability scanner, it does not know paths your config has not marked sensitive, and it cannot judge business logic. Say what was not checked when reporting work on these paths.
