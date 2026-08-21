# legacy-shop

A tiny, deliberately legacy Express monolith. It boots, serves requests, and passes its own tests, and it is seeded with the exact bug patterns third-rail exists to catch: a webhook whose signature verification is silently broken, a correct verifier nobody calls, an unprotected refund endpoint, and a login with no rate limit.

```bash
npm install
npm test
npm start
```

Zero API keys. The payment provider is simulated.

Defect inventory with spoilers: `docs/FIXTURE_DEFECTS.md` at the repo root, kept outside this directory so the reviewer agent cannot read it while analyzing the code. Demo script: the root README.
