---
name: "Blast-radius agent catches the seeded bugs"
tags: [agent, review]
plugins: ["../.."]
runs: 1
max_turns: 12
---

Use the blast-radius agent to review the billing and webhook paths of examples/legacy-shop. I want to know what is unsafe before we touch anything.
