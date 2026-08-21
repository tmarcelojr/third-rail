# third-rail

Safe changes to the code everyone is afraid to touch.

**Who this is for:** the backend engineer maintaining a legacy Node/Express monolith, where the billing routes, webhook handlers, and auth middleware are the third rail: the people who wrote them are gone, test coverage there is thin, and every change near money is a risk conversation. AI coding tools sharpen the problem in one specific way: they produce plausible changes fast, and plausible is the failure mode where wrong is expensive.

**What it does:** turns your org's hardening knowledge into three things that fire at the right moments.

| Component | What | When it acts |
|---|---|---|
| Hook (`hooks/`) | Deterministic guard on `Edit`/`Write`. Blocks casual edits to sensitive paths and points at the runbook. | Every edit, before it happens |
| Skill (`skills/hardening-runbook`) | The org runbook: nine production-bought rules for payment, webhook, and auth code, gotchas first. | When work touches sensitive code, or the hook fires |
| Agent (`agents/blast-radius.md`) | Safe-change reviewer. Maps affected routes and middleware chains with a bundled deterministic tracer, checks the change against the runbook, and reports every guard as verified (call site + test) or claimed only. | On demand, before or after a risky change |

One sentence of design: the hook enforces (rules that are not executable get skipped), the skill knows (org knowledge generic review cannot have), the agent judges (a script computes the route map; the model interprets it).

## Install

From GitHub:

```
/plugin marketplace add tmarcelojr/third-rail
/plugin install third-rail@third-rail
```

From a fresh clone:

```
git clone https://github.com/tmarcelojr/third-rail.git
cd third-rail
```

then inside Claude Code, add the clone as a local marketplace by path (use `./`, or the absolute path to the clone; a bare `.` is not accepted):

```
/plugin marketplace add ./
/plugin install third-rail@third-rail
```

The GitHub form above is the simplest path and needs no clone. Verify either way with `/plugin list` (third-rail shows enabled). Validation: `claude plugin validate .` passes clean from the repo root.

**Activate after installing.** The install summary ends with either "Plugin is now active." or "Run /reload-plugins to activate." Follow it: `/reload-plugins` arms the guard hook without restarting. Confirm with `/hooks`, which should list the third-rail PreToolUse guard.

## Try it in 5 minutes

The repo bundles `examples/legacy-shop`: a tiny Express monolith that boots, passes its own tests, and is seeded with real production bug patterns (inventory with spoilers in [examples/legacy-shop/BUGS.md](examples/legacy-shop/BUGS.md)).

```bash
cd examples/legacy-shop
npm install
claude
```

1. Ask for an innocent-sounding change:

   > Add a customer email notification to the refund endpoint in routes/billing.js

   The guard hook blocks the edit: billing.js is a marked sensitive path. The block message tells Claude (and you) what to do instead of just saying no.

2. Run the reviewer:

   > Use the blast-radius agent to review the billing and webhook paths of this app

   Expect it to find, with file:line: the global `express.json()` destroying the webhook's raw body, the signature check that logs a mismatch and processes the event anyway behind an always-200, a correct constant-time verifier with passing tests and zero call sites, the refund route missing the auth its sibling routes carry, and login missing the rate limiter that `/api/search` has.

3. Acknowledge and fix:

   ```bash
   touch .third-rail-ack
   ```

   Then let Claude apply the fix with the runbook loaded. The ack file is a recorded decision that the runbook was consulted, not a bypass.

Prove the seeded bugs are real without the plugin (30 seconds):

```bash
npm start &
curl -s -X POST localhost:3459/api/webhooks/payments -H 'Content-Type: application/json' -d '{"type":"payment.succeeded","id":"evt_forged"}'
curl -s -X POST localhost:3459/api/billing/refund -H 'Content-Type: application/json' -d '{"orderId":"ord_1","amount":9999}'
```

A forged, unsigned webhook returns `{"received":true}` and a no-auth refund succeeds. That is the monolith this plugin exists for.

## What this is not

Anthropic ships general-purpose `code-review` and `claude-security` plugins. third-rail is deliberately not that: it is the layer generic review cannot be, your org's runbook and your org's sensitive paths, enforced deterministically at edit time and reviewed with judgment on demand. The runbook that ships here is one real org's starting point; the intent is that you edit `skills/hardening-runbook/SKILL.md` and `.third-rail.json` until they are yours. A hook rather than an MCP server because the persona's pain is enforcement at the moment of change, not access to an external system.

## Context cost

Measured from this repo's files (tokens estimated at words x 1.3):

| State | Cost |
|---|---|
| Idle (always loaded) | ~185 tokens: the skill and agent descriptions |
| Guard hook | 0 tokens idle; runs out of process. ~120 tokens of message only when it blocks |
| Skill triggered | ~1,100 tokens, loaded only when sensitive work starts |
| Agent invoked | Runs in its own context; the main conversation pays only for the report |

## Supply chain

The plugin has zero runtime dependencies: the hook and the route tracer are single-file Node stdlib scripts you can read start to finish in a few minutes ([hooks/scripts/guard.js](hooks/scripts/guard.js), [bin/third-rail-route-map](bin/third-rail-route-map)). No network installs, no postinstall scripts. The demo fixture depends on `express` only, installed by you, inside the fixture. The hook fails open on malformed input so a guard bug cannot brick your editor loop.

## Honest limitations

The route tracer is regex-based static analysis: it misses dynamic route registration, computed paths, and middleware spread across lines, and it says so in its own output. The chosen tradeoff is zero dependencies over an AST parser. The guard's acknowledgment file is a speed bump that records a decision; it is not access control. Two more limits, stated plainly: the guard watches the file-editing tools, so a shell command like `sed -i` through Bash is not intercepted; and Claude itself can create the acknowledgment file, so the ack is an audit trail of a considered decision, not a barrier the model cannot cross. Fleet-grade enforcement belongs in CI, which is the first with-more-time item. The agent reviews; it does not prove runtime behavior. Every blast-radius report ends with what it could not verify statically, on purpose.

## What I cut, and why

- **MCP server:** nothing here needs external system access; adding one would be surface area for its own sake.
- **Multi-framework support (Koa, Fastify, Rails):** one persona, one stack, done properly, beats four done shallowly.
- **Auto-fix mode:** on billing code, a reviewer that writes its own changes unreviewed is the disease pretending to be the cure.
- **Broad eval suite:** three eval cases ship as a seed (see `evals/`); a real suite with measured trigger rates is the first with-more-time item.

## With more time

Expand the eval suite and publish measured skill trigger rates against realistic prompts. Run blast-radius headless in CI so every PR touching a sensitive path gets a report as a comment. Distribute `.third-rail.json` and the runbook org-wide through managed settings so fifty teams inherit one paved road.

## For your own workflow

The one-page guide for building a plugin like this for a different workflow in your org: [docs/BUILD_YOUR_OWN_PLUGIN.md](docs/BUILD_YOUR_OWN_PLUGIN.md).

## License

MIT
