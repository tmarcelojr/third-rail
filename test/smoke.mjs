#!/usr/bin/env node
// third-rail smoke test: executes the boundaries reviews kept finding broken.
//
// Three review rounds each caught a component that was defined but not wired:
// a hook that validated but never fired, a config line that killed the install,
// an agent that could not load its runbook. Reading the files caught none of
// them; running them caught all of them. So this script runs them: real hook
// payloads through the guard, the tracer against a committed golden map, and
// wiring checks for every declared component. Node stdlib only.
//
//   node test/smoke.mjs

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = path.join(ROOT, 'hooks', 'scripts', 'guard.js');
const TRACER = path.join(ROOT, 'bin', 'third-rail-route-map');
const FIXTURE = path.join(ROOT, 'examples', 'legacy-shop');
const GOLDEN = path.join(ROOT, 'test', 'golden', 'legacy-shop-map.json');

let failures = 0;
let count = 0;
const cleanups = [];

function check(name, ok, detail = '') {
  count++;
  if (ok) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

function tmpdir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `third-rail-smoke-${label}-`));
  cleanups.push(dir);
  return dir;
}

function runGuard(payload) {
  const r = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 10000
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function runTracer(dir) {
  const r = spawnSync(process.execPath, [TRACER, dir], { encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0) throw new Error(`tracer exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function edit(filePath, cwd) {
  return { tool_name: 'Edit', tool_input: { file_path: filePath }, cwd };
}

// ---------------------------------------------------------------- guard matrix

{
  const repo = tmpdir('guard');
  fs.mkdirSync(path.join(repo, 'routes'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'lib'), { recursive: true });
  const config = { sensitivePaths: ['**/routes/billing.js', '**/routes/webhooks.js'] };
  fs.writeFileSync(path.join(repo, '.third-rail.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(repo, 'routes', 'billing.js'), 'x');
  fs.writeFileSync(path.join(repo, 'lib', 'util.js'), 'x');

  check('guard: blocks a sensitive Edit',
    runGuard(edit(path.join(repo, 'routes', 'billing.js'), repo)).code === 2);

  check('guard: allows a non-sensitive Edit',
    runGuard(edit(path.join(repo, 'lib', 'util.js'), repo)).code === 0);

  check('guard: blocks a Write creating a not-yet-existing sensitive file',
    runGuard(edit(path.join(repo, 'routes', 'webhooks.js'), repo)).code === 2);

  check('guard: resolves a relative path against the payload cwd, not the process cwd',
    runGuard(edit('routes/billing.js', repo)).code === 2);

  if (process.platform !== 'win32') {
    const outside = tmpdir('guard-target');
    fs.writeFileSync(path.join(outside, 'real.js'), 'y');
    const linkRepo = tmpdir('guard-links');
    fs.mkdirSync(path.join(linkRepo, 'routes'), { recursive: true });
    fs.writeFileSync(path.join(linkRepo, '.third-rail.json'), JSON.stringify(config));
    fs.symlinkSync(path.join(outside, 'real.js'), path.join(linkRepo, 'routes', 'billing.js'));
    check('guard: blocks when the guarded path is itself a symlink',
      runGuard(edit(path.join(linkRepo, 'routes', 'billing.js'), linkRepo)).code === 2);

    fs.rmSync(path.join(linkRepo, 'routes', 'billing.js'));
    fs.writeFileSync(path.join(linkRepo, 'routes', 'billing.js'), 'x');
    fs.symlinkSync(path.join(linkRepo, 'routes', 'billing.js'), path.join(linkRepo, 'link-helper.js'));
    const r = runGuard(edit(path.join(linkRepo, 'link-helper.js'), linkRepo));
    check('guard: blocks an innocent-looking symlink pointing at a guarded file',
      r.code === 2 && r.stderr.includes('resolves to'));
  } else {
    console.log('skip guard symlink cases (win32)');
  }

  const broken = tmpdir('guard-broken');
  fs.writeFileSync(path.join(broken, '.third-rail.json'), 'NOT JSON');
  fs.writeFileSync(path.join(broken, 'paymentService.js'), 'x');
  fs.writeFileSync(path.join(broken, 'orders.js'), 'x');
  const kw = runGuard(edit(path.join(broken, 'paymentService.js'), broken));
  check('guard: broken config still blocks default-token files, and says the config is out',
    kw.code === 2 && kw.stderr.includes('NOT in effect'));
  const quiet = runGuard(edit(path.join(broken, 'orders.js'), broken));
  check('guard: broken config surfaces a systemMessage warning on allowed edits',
    quiet.code === 0 && quiet.stdout.includes('"systemMessage"') && quiet.stdout.includes('NOT in effect'));

  fs.writeFileSync(path.join(repo, '.third-rail-ack'), '');
  check('guard: acknowledgment file permits the edit',
    runGuard(edit(path.join(repo, 'routes', 'billing.js'), repo)).code === 0);
  fs.rmSync(path.join(repo, '.third-rail-ack'));

  const patho = tmpdir('guard-patho');
  fs.writeFileSync(path.join(patho, '.third-rail.json'),
    JSON.stringify({ sensitivePaths: ['*a*'.repeat(15)] }));
  fs.writeFileSync(path.join(patho, 'file.js'), 'x');
  check('guard: pathological glob fails open without hanging',
    runGuard(edit(path.join(patho, 'file.js'), patho)).code === 0);
}

// ---------------------------------------------------------------- tracer

{
  const map = runTracer(FIXTURE);
  map.root = '<fixture>';
  const rendered = JSON.stringify(map, null, 2);
  const golden = fs.readFileSync(GOLDEN, 'utf8').trimEnd();
  check('tracer: fixture output matches the committed golden map',
    rendered === golden,
    'intentional tracer change? re-cut with: node bin/third-rail-route-map examples/legacy-shop (root normalized to "<fixture>")');

  const edge = tmpdir('tracer-edge');
  fs.writeFileSync(path.join(edge, 'app.js'), [
    "const apiRouter = require('./routes/api');",
    "const webhookRoutes = require('./routes/webhooks');",
    "app.use(helmet()); app.use('/api', apiRouter);",
    "app.use(express.json()); app.use(express.json({ limit: '1mb' }));",
    "app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);",
    "router.use(requireAuth);",
    "const msg = `don't`; app.get('/apostrophe-route', requireAuth, (req, res) => res.end());",
    ""
  ].join('\n'));
  const m = runTracer(edge);

  check('tracer: multi-target mount keeps every target, in argument order',
    m.mounts.some((x) => x.prefix === '/api/webhooks' && x.target === 'express.raw(...)') &&
    m.mounts.some((x) => x.prefix === '/api/webhooks' && x.target === 'webhookRoutes' && x.targetFile === './routes/webhooks') &&
    m.mounts.findIndex((x) => x.target === 'express.raw(...)') <
      m.mounts.findIndex((x) => x.target === 'webhookRoutes'));

  check('tracer: router.use is mapped with its owner',
    m.mounts.some((x) => x.owner === 'router' && x.target === 'requireAuth'));

  const line3 = m.mounts.filter((x) => x.line === 3).map((x) => x.target);
  check('tracer: same-line entries keep source order',
    JSON.stringify(line3) === JSON.stringify(['helmet(...)', 'apiRouter']));

  check('tracer: two parsers on one line both survive',
    m.parsers.filter((p) => p.line === 4).length === 2);

  check('tracer: a route on a line containing a string with an apostrophe is not dropped',
    m.routes.some((r) => r.path === '/apostrophe-route' &&
      JSON.stringify(r.middlewares) === JSON.stringify(['requireAuth'])));
}

// ---------------------------------------------------------------- wiring

{
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
  const entry = hooks.hooks.PreToolUse[0];
  check('wiring: hook matcher is the owned list',
    entry.matcher === 'Edit|Write|MultiEdit');
  const cmd = entry.hooks[0].command.replace('${CLAUDE_PLUGIN_ROOT}', ROOT);
  let executable = false;
  try { fs.accessSync(cmd, fs.constants.X_OK); executable = true; } catch {}
  check('wiring: hook command path exists and is executable', executable, cmd);

  const agent = fs.readFileSync(path.join(ROOT, 'agents', 'blast-radius.md'), 'utf8');
  const toolsLine = agent.split('\n').find((l) => l.startsWith('tools:')) || '';
  check('wiring: agent allowed-tools include Skill (its step 5 depends on it)',
    toolsLine.includes('Skill'));
  check('wiring: agent report template carries the caller relay line',
    agent.includes('Caller: reproduce both findings sections and this scoreboard verbatim'));

  for (const manifest of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'examples/legacy-shop/.third-rail.json']) {
    let ok = true;
    try { JSON.parse(fs.readFileSync(path.join(ROOT, manifest), 'utf8')); } catch { ok = false; }
    check(`wiring: ${manifest} parses`, ok);
  }

  // Every file:line the defect inventory cites must exist. Regex-scan the doc
  // rather than parsing its prose: any token shaped like path.js:NN is checked.
  const inventory = fs.readFileSync(path.join(ROOT, 'docs', 'FIXTURE_DEFECTS.md'), 'utf8');
  const refs = [...inventory.matchAll(/([\w./-]+\.js):(\d+)/g)];
  let bad = [];
  for (const [, file, lineStr] of refs) {
    const full = path.join(FIXTURE, file);
    if (!fs.existsSync(full)) { bad.push(`${file} missing`); continue; }
    const lines = fs.readFileSync(full, 'utf8').split('\n').length;
    if (Number(lineStr) > lines) bad.push(`${file}:${lineStr} beyond EOF (${lines} lines)`);
  }
  check(`wiring: all ${refs.length} file:line references in FIXTURE_DEFECTS.md exist`,
    bad.length === 0, bad.join('; '));
}

// ---------------------------------------------------------------- summary

for (const dir of cleanups) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

console.log(failures === 0
  ? `\nall ${count} checks passed`
  : `\n${failures} of ${count} checks FAILED`);
process.exit(failures === 0 ? 0 : 1);
