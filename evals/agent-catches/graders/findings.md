---
type: llm
criteria: >
  The blast-radius report identifies, with file references, at least three of the
  four seeded defects: (1) the global express.json() destroys the raw body before
  webhook signature verification; (2) the webhook handler continues processing and
  returns 200 after a failed signature check; (3) verifySignature in
  utils/verifySignature.js is defined and tested but has zero live call sites,
  reported as claimed-only rather than as protection; (4) the POST /refund route
  lacks the auth middleware its sibling billing routes carry. The report also
  states what it could not verify statically.
---
