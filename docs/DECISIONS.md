# Decision log

Steering record for the third-rail build: where the human overrode the tool, and why. Kept because judgment is the deliverable; the code is just its residue. Entries D1 through D8 are from 2026-08-20; D9 and D10 from 2026-08-21; D11 from 2026-08-22; D12 and D13 from 2026-10-04, after submission. Written during the build and reviewed by the author before submission.

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

`examples/legacy-shop` boots, serves, and passes its own tests while carrying six seeded bugs, each mapped to the runbook item that catches it. Bugs were proven live before shipping: a forged unsigned webhook returns 200, a no-auth refund moves money, and the untouched verifier's tests run green. The pattern is borrowed from my scanner's eval fixture: known ground truth or the demo proves nothing.

The inventory itself lives at `docs/FIXTURE_DEFECTS.md`, not inside the fixture. Claude wrote it into `examples/legacy-shop/` while scaffolding the fixture, and a live run showed the reviewer agent reading it and citing defect IDs from it. The agent had already found the auth gap on its own before opening that file, but an answer key inside the system under test invalidates the test regardless of the order things happened in. The inventory is written for the person evaluating this repo, so it belongs with the other documents written for them.

## D8. Quality-first, scope-fixed

Scope was frozen at design time: one agent, one skill, one hook, one fixture. New ideas during the build landed here as with-more-time items instead of in the tree. The lean shape is doctrine (grab-bag plugins are the ecosystem's documented failure mode), not a time constraint.

## D9. The hook that validated but did not fire

The plugin passed `claude plugin validate` and every component tested green in isolation, so I called it done. The first live install proved it was not: an edit to billing.js sailed straight through, unblocked. Two real defects hid behind a passing validator. The hook command was `node "..."` with nested quotes and the script lacked its executable bit, so the hook errored and a PreToolUse hook that errors fails open. And a stray `.third-rail-ack` left at the repo root during testing was disabling the guard for everything beneath it, because the ack lookup walked too many ancestors.

This is the plugin's own thesis turned on its author: a control that is defined and tested but not verified as wired on the live path is not done. Fixes: direct-executable command matching the documented pattern, the exec bit committed as 100755 so it survives a clone, an explicit hooks declaration, and an ack scoped to the config directory or cwd so no distant stray can silently disable it. The acceptance check was the one that mattered: an edit to a guarded path is now blocked in a live session, not just in a unit test.

## D10. The fix's fix: caught by an adversarial fresh-clone install

Before shipping, two independent review agents graded the repo cold: one simulating the hiring panel, one pure red team instructed to execute every claim. The red team fresh-cloned the repo and ran a real CLI install, and found that the explicit `"hooks"` declaration added in D9 makes the installed plugin fail to load entirely on current Claude Code (duplicate-hooks error: the standard hooks/hooks.json is auto-loaded, so declaring it again collides with itself). The validator passes regardless. That is the D9 failure mode recurring on the D9 fix itself, and it was caught only because the acceptance test moved one level closer to reality: unit test, then live session, then fresh-clone install. Each level caught what the previous one could not.

Fixes from this round, all re-verified: removed the duplicate hooks declaration (auto-load is the correct mechanism); hardened the guard against junk config entries and pathological glob patterns (both crash and hang reproduced by the red team, both now fail open with a note); replaced the over-broad default globs with whole-word token matching on code files so an unconfigured install no longer blocks files like authors-list.js in unrelated repos; disclosed the Bash bypass and the model-can-ack limits in the README; aligned the fixture's bug table to the runbook's item numbers (a later round found two of those mappings were numerically right and semantically wrong, and fixed both); tightened the hook eval grader to require the block be surfaced to the human, not silently acknowledged.

## D11. The consolidation round: why the fixes kept needing fixes

2026-08-22. Two fresh reviewers, one following the README cold and executing every step, one red-teaming only the fix commits, returned 33 verified findings between them. Two of the six previous fixes had not worked at runtime: the report-relay instruction had been added to the agent's own system prompt, where the caller never reads it, and the "deterministic" guard count still varied across byte-identical runs (four live runs, four different denominators) because the guard's category was pinned but its membership in the review was not. Worse, the fix round itself had introduced instances four through six of the plugin's own defined-but-not-wired class: a NotebookEdit matcher entry whose payload key the guard never read, a config-problem warning computed but surfaced on only one branch, and a cwd read after the path resolution that needed it.

Staring at all three rounds together produced the diagnosis this round is built on. First, facts were duplicated across files with no owner, so every fix updated one copy and left the rest stale; now every duplicated fact has one owner file and other mentions point instead of restating. Second, runtime boundaries were verified by reading, never by executing; now `test/smoke.mjs` executes every boundary a script can reach: real hook payloads, both symlink directions, a deliberately broken config, a golden route map, and wiring checks. Third, determinism was promised in the judgment layer, where it is impossible, and absent in the code layer, where it is cheap; now the guard table's membership is pinned to two rules bounded by the committed config, and the comparability claim is cut down to exactly what those rules guarantee.

Two corrections admitted rather than smoothed over. The relay instruction now lives at the tail of the report itself, the one place the caller must read to relay anything at all. And this entry supersedes D7's "each mapped to the runbook item that catches it": five of the six map, and the sixth's unmapped state is the point.

## D12. After submission: two over-matches, found by building a map

2026-10-04. While building an explorable map of the plugin with Claude, I ported the guard's matcher into an in-page simulator and diffed it against the real script on ten payloads. The port matched; the script did not match my intent in two places. A leading `**/` consumed its own slash, so `**/server.js` compiled to "any path ending in server.js" and blocked `lib/observer.js` in the fixture. And with no config, default words were checked against every segment of the absolute path, so a checkout named `payments-api` made every code file sensitive, `authors-list.js` included, under a message that said "filename".

Both failed closed, so they cost noise rather than safety, and no smoke check covered either. Fixes: `**/` now means zero or more whole directories; default matching reads only segments below the config directory or the working directory (and its realpath); the block reason names the segment that matched. Five new smoke checks, three of which fail against the previous guard. The same day, a headless session on Claude Code 2.1.289 confirmed the installed hook still blocks an Edit to billing.js. The lesson is D11's from the other side: the matcher had tests, but only for the inputs I had thought of, and a second implementation compared against the first found the ones I had not.

## D13. The evals ran, and found D9 again

2026-10-04. `claude plugin eval` shipped, so the three seed cases finally ran, and the first passes were wrong in three different ways. The run's workspace was empty, so `examples/legacy-shop/...` did not exist; each case now scaffolds the fixture in. Then the hook case let a billing edit through. Replaying the exact payload into guard.js exited 2, so the guard was right and the hook never ran it: eval runs give hooks a temporary HOME, my node comes from a Volta shim that needs HOME to find its toolchain, the hook errored, and a PreToolUse hook that errors fails open. That is D9's failure class in a new environment, and the guard's own fail-open design is why it was silent. With a real node binary first on PATH, the hook fired in every plugin run.

The third problem was the grader. An LLM judge failed two runs that did exactly the right thing, so the hook case now uses three regex checks: the block message is in the trace, the reply says it was blocked, and Claude did not create the ack itself. That last check caught one run in five where Claude followed the block's steps, acknowledged on its own, and finished the edit: the README's stated limit, now measured. And the finding cases do not separate the arms on this fixture, because a current model finds the seeded bugs from the code alone. Results and setup are in evals/README.md, including what they do not show.

## With-more-time candidates captured during the build

- Evals with several runs per arm, and graders for what the reviewer adds over a bare review (claimed-only grading, runbook item numbers, a reconciling scoreboard), since the finding graders cannot separate the arms on this fixture.
- Step 3 of the block message asks Claude to stop and get the user's go-ahead before creating the ack; the hook eval measured one self-acknowledgment in five runs.
- Fail closed only when node cannot start: a two-line shell wrapper that exits 2 with a clear message on exit 126 or 127, opt-in per org, while guard.js keeps failing open on its own bugs.
- Headless blast-radius in CI commenting on PRs that touch sensitive paths.
- Org-wide distribution of `.third-rail.json` and the runbook via managed settings.
- A `strict`-tier limiter check: the fixture's unused export mirrors a real pattern worth its own runbook line.
- A warn-only Bash heuristic for guarded paths. Multi-model testing (2026-08-22) showed shell-heavy models route around the Edit-tool matcher entirely: two Opus runs edited billing.js through heredocs and the guard never fired, while the runbook skill still loaded and carried the discipline. Measured, then deliberately scoped out: a blocking version would fire on innocent reads like `grep billing.js` and miss interpolated writes, so edit-time shell coverage stays a warn-only candidate and CI remains the model-independent enforcement layer.
