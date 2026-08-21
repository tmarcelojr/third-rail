# Build your own plugin

You watched third-rail block an edit to billing code and explain why. This page is how you build the same thing for your own workflow, in about an hour, most of which is thinking, not typing. It assumes you have Claude Code installed and one workflow that keeps going wrong.

## The one rule

A plugin is your team's judgment, packaged. Do not start from "what can I build." Start from the last time something went wrong twice.

## Step 1: Name the pain (5 minutes)

One workflow, one recurring failure, one sentence. Real examples from teams like ours:

- "Every dbt model change breaks a downstream dashboard nobody checked."
- "Terraform module bumps get merged without anyone reading the plan diff."
- "On-call keeps rediscovering the same five runbook steps at 3am."

If your sentence contains "and," cut it in half and keep the worse half.

## Step 2: Write the skill first (20 minutes)

The skill is a markdown file holding what your best engineer knows. The test: if they left tomorrow, this file is what you would wish they had written down.

Create `skills/<your-runbook>/SKILL.md`:

```markdown
---
name: dbt-change-runbook
description: Runbook for changing dbt models safely. Use when adding, editing,
  or reviewing dbt models, snapshots, or schema.yml files, especially models
  with downstream exposures or dashboard dependencies.
---

# Changing dbt models without breaking dashboards

## 1. <Your most expensive lesson>
**Gotcha:** <what it looks like when it goes wrong>
**Rule:** <what to do instead>
```

Two things make skills work or fail:

- **Gotchas first.** The generic advice is already in the model. What it does not have is that your `orders` model has a circular exposure with finance's dashboard. Write the surprises.
- **The description decides whether it ever fires.** Write it in third person with the actual words someone types: file types, tool names, verbs. "Use when editing dbt models or schema.yml" triggers. "Helps with data quality" never will. After installing, test it: ask Claude to do the risky thing and check the skill loads. If it does not, sharpen the description and try again.

## Step 3: Add an agent only if the work is multi-step (15 minutes, often skipped)

If the job is "know the rules while editing," the skill alone is enough. Stop here and ship.

Add an agent when the job is read, then trace, then judge: reviewing a change's blast radius, walking a dependency graph, checking claims against reality. Create `agents/<reviewer>.md` with frontmatter (`name`, `description`, `tools: Read, Grep, Glob, Bash`) and write the procedure as numbered steps ending in a report format. Two patterns worth stealing from third-rail:

- Let a small deterministic script compute the facts (route maps, lineage, plan diffs) and make the agent interpret them. Scripts do not hallucinate inventory.
- Make the report say what it could NOT verify. A review that hides its blind spots is worse than no review.

## Step 4: Add a hook only for "always," never for "usually" (10 minutes, usually skipped)

A hook is a shell script that runs on events like PreToolUse, outside the model. It cannot be talked out of anything. That makes it right for exactly one kind of rule: the ones where "Claude usually remembers" is not good enough. Blocking edits to guarded paths. Refusing commits with secrets. Requiring a plan file before a prod change.

If you would accept the model occasionally forgetting the rule, it is not a hook, it is a line in the skill.

`hooks/hooks.json` registers the script; the script reads JSON from stdin and exits 0 to allow or 2 to block with a message on stderr. Keep it dependency-free and make the block message teach: say which rule matched and what to do next, not just "no." Steal `hooks/scripts/guard.js` from third-rail as a starting point.

## Step 5: Wrap it as a plugin (5 minutes)

```
your-plugin/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/<your-runbook>/SKILL.md
├── agents/<reviewer>.md          (if you added one)
└── hooks/hooks.json              (if you added one)
```

`.claude-plugin/plugin.json`:

```json
{ "name": "your-plugin", "description": "One sentence.", "version": "0.1.0" }
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "your-plugin",
  "owner": { "name": "Your Name" },
  "plugins": [{ "name": "your-plugin", "source": "." }]
}
```

## Step 6: Validate, install, test on a colleague's machine (10 minutes)

```bash
claude plugin validate .
```

Fix what it flags, then in Claude Code:

```
/plugin marketplace add ./
/plugin install your-plugin@your-plugin
```

Now the real test: push to a repo, have a teammate clone it, run the same two commands, and try the risky workflow. If it works on their machine with no help from you, you have a plugin. If they hit a wall, that wall is your first troubleshooting entry.

## Troubleshooting

| Symptom | Usual cause |
|---|---|
| `validate` fails | `skills/` or `agents/` accidentally placed inside `.claude-plugin/`. Only the two json files live there. |
| Skill never triggers | Description too vague. Rewrite with the concrete words and file types people actually use, reinstall, retest. |
| Hook fires constantly or never | Path patterns too broad or too narrow. Print the incoming file path from the script while tuning. |

## What to build next

Once the first one works, the pattern repeats for any workflow with tribal knowledge and a blast radius: a migration-review plugin for the database team, an incident-runbook plugin for on-call, a release-checklist plugin for whoever cuts versions. Same shape every time: pain, skill, maybe agent, hook only for always, validate, hand it to a teammate.

Write the skill for the engineer who has not had the incident yet. That is the whole trick.
