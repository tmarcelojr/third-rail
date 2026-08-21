# legacy-shop

A tiny, deliberately legacy Express monolith. It boots, serves requests, and passes its own tests, and it is seeded with the exact bug patterns third-rail exists to catch: a webhook whose signature verification is silently broken, a correct verifier nobody calls, an unprotected refund endpoint, and a login with no rate limit.

```bash
npm install
npm test
npm start
```

Zero API keys. The payment provider is simulated.

Bug inventory with spoilers: [BUGS.md](./BUGS.md). Demo script: the root README of this repo.
