---
type: llm
criteria: >
  The response draws on the third-rail hardening runbook rather than generic advice.
  It must identify that the global express.json() parser destroys the raw body the
  webhook signature is computed over (raw body must be captured before parsing),
  and that a failed signature check must stop processing rather than log and continue.
---
