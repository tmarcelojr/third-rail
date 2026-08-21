# Decision log

Steering record for the third-rail build: where the human overrode the tool, and why. Kept because judgment is the deliverable; the code is just its residue. All entries 2026-08-20 unless noted. Written during the build and reviewed by the author before submission.

## D1. Persona: rejected the AI's first recommendation

Claude's first recommendation was a meta plugin about rolling out Claude Code itself across teams. Rejected after a market check: the Terraform lane has a 2,290-star incumbent (antonbabenko/terraform-skill), the governance-hooks lane has 1,500-star cc-safety-net, and another candidate already used the rollout lane for this exact assignment. A GitHub search for legacy Node/Express monolith safety returned zero plugins, while three of my own repos hold production webhook and payment scar tissue. Deepest verifiable story, emptiest lane.

## D2. One story, three components

Every component answers the same sentence: in legacy code, "done" is a lie until the change is traced, checked against the runbook, and verified as wired. The hook is the fence, the skill is the manual, the agent is the electrician. Anything that did not serve that sentence got cut (see README, "What I cut").

## D3. Hook, not MCP

The persona's pain is enforcement at the moment of change, not access to an external system. An MCP server here would be surface area for its own sake, which the assignment explicitly warns against.

## D4. The runbook is mined, not invented

The skill's nine items come from a documented mine of my production repos: a real broken-raw-body webhook, a real charged-but-unfulfilled 200-on-failure incident, a real verifier that had passing tests and zero callers for three weeks. I rejected a generic best-practices draft; if I cannot tell the war story behind an item, it does not ship.

## D5. Scripts compute, the model judges

The blast-radius agent runs a zero-dependency route tracer and interprets its JSON instead of re-deriving the route table by prompt. During verification the tracer flagged `express.json` inside a code comment as a parser mount; fixed by stripping comments before matching, newline-preserving so line numbers stay honest. Regex over AST is a stated tradeoff: zero installs, documented blind spots, and the tracer prints its own limitations in every output.

## D6. The guard teaches instead of just refusing

Exit 2 with a message naming the matched rule and the exact three steps to proceed (runbook, agent, acknowledgment file). The ack file is a recorded decision, not access control, and the hook fails open on malformed input so a guard bug cannot brick the editor loop. A blocked engineer who does not learn why just disables the hook.

## D7. The fixture is an answer key, not a toy

`examples/legacy-shop` boots, serves, and passes its own tests while carrying six seeded bugs, each mapped to the runbook item that catches it (BUGS.md). Bugs were proven live before shipping: a forged unsigned webhook returns 200, a no-auth refund moves money, and the untouched verifier's tests run green. The pattern is borrowed from my scanner's eval fixture: known ground truth or the demo proves nothing.

## D8. Quality-first, scope-fixed

Scope was frozen at design time: one agent, one skill, one hook, one fixture. New ideas during the build landed here as with-more-time items instead of in the tree. The lean shape is doctrine (grab-bag plugins are the ecosystem's documented failure mode), not a time constraint.

## D9. The hook that validated but did not fire

The plugin passed `claude plugin validate` and every component tested green in isolation, so I called it done. The first live install proved it was not: an edit to billing.js sailed straight through, unblocked. Two real defects hid behind a passing validator. The hook command was `node "..."` with nested quotes and the script lacked its executable bit, so the hook errored and a PreToolUse hook that errors fails open. And a stray `.third-rail-ack` left at the repo root during testing was disabling the guard for everything beneath it, because the ack lookup walked too many ancestors.

This is the plugin's own thesis turned on its author: a control that is defined and tested but not verified as wired on the live path is not done. Fixes: direct-executable command matching the documented pattern, the exec bit committed as 100755 so it survives a clone, an explicit hooks declaration, and an ack scoped to the config directory or cwd so no distant stray can silently disable it. The acceptance check was the one that mattered: an edit to a guarded path is now blocked in a live session, not just in a unit test.

## With-more-time candidates captured during the build

- Eval suite with measured trigger rates (three seed cases ship in `evals/`).
- Headless blast-radius in CI commenting on PRs that touch sensitive paths.
- Org-wide distribution of `.third-rail.json` and the runbook via managed settings.
- A `strict`-tier limiter check: the fixture's unused export mirrors a real pattern worth its own runbook line.
