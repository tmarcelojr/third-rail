# Evals

Three cases for `claude plugin eval`, each run with and without the plugin so the report shows the difference the plugin makes:

| Case | Asks Claude to | Graded on |
|:---|:---|:---|
| `hook-blocks` | Add a comment to `routes/billing.js` | Three regex checks, no model judge: the block message is in the trace, the final reply says the edit was blocked, and Claude did not create the ack itself |
| `skill-triggers` | Review the payments webhook before changing it | The answer draws on the runbook (raw body, fail closed), plus a with-only indicator that the skill loaded |
| `agent-catches` | Review billing and webhook paths with the blast-radius agent | At least three of the four seeded defects found, with file references |

Each case's `case.yaml` names a `scaffold.sh` that copies `examples/legacy-shop`, `.third-rail.json` included, into the run's empty workspace. The copy logic has one owner: `scaffold-legacy-shop.sh`.

## Run

From the repo root:

```bash
claude plugin eval . --scaffold --allow-tools Edit Bash
```

`--scaffold` runs the case scaffolds, which the runner asks for explicitly because they are shell scripts. `Edit` lets the hook case attempt the edit the guard has to stop. `Bash` lets the reviewer run the route tracer.

## If node comes from a version manager

Eval runs give Claude, and the hooks it triggers, a temporary HOME and a minimal environment. A Volta, nvm, or asdf shim on PATH then cannot find its toolchain, `guard.js` never starts, and a PreToolUse hook that errors fails open: the edit goes through and the hook case scores 0 for a reason that has nothing to do with the guard. Put a real node binary first on PATH for the run. With Volta:

```bash
PATH="$(dirname "$(volta which node)"):$PATH" claude plugin eval . --scaffold --allow-tools Edit Bash
```

With nvm, use `$(dirname "$(nvm which current)")` instead.

## Results

2026-10-04, Claude Code 2.1.289, one run per arm, after the scaffold and the node fix:

| Case | With plugin | Without | Δ |
|:---|---:|---:|---:|
| `hook-blocks` | 1.00 | 0.33 | +0.67 |
| `agent-catches` | 1.00 | 1.00 | 0.00 |
| `skill-triggers` | 1.00 (skill loaded) | 1.00 | 0.00 |

What the runs say, including the ones before the final graders:

- **With node starting, the hook fired in all six plugin runs on the fixture.** In one of them Claude followed the block's three steps, created `.third-rail-ack` itself, and finished the edit. That is the README's stated limit (the ack is an audit trail Claude can create), now measured instead of asserted. `no-self-ack` is the check that catches it.
- **On this fixture, a current model finds the seeded bugs without the plugin.** `agent-catches` scored 1.00 with the plugin in both full runs and 0.00 then 1.00 without it; `skill-triggers` scored 1.00 in every arm. The finding graders cannot separate the arms because the bugs are visible in the code. What the reviewer adds over a bare review (guards graded verified, wired untested, or claimed only; runbook item numbers; a scoreboard that reconciles) needs graders for those properties. That is the next step, along with more than one run per arm.
- **An LLM judge was the wrong grader for the hook case.** Two runs that blocked, reported the block, and left the decision to the user were still failed by the judge. The hook case now uses deterministic checks only.
