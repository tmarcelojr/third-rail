#!/usr/bin/env node
/*
 * generate-readme-assets.mjs
 *
 * Renders the README's terminal screenshots and animated demo from the real
 * command output captured below, so every asset is reproducible from source.
 *
 *   npm install --no-save --no-package-lock playwright   # dev-only, gitignored
 *   npx playwright install chromium                      # once
 *   node scripts/generate-readme-assets.mjs
 *
 * Requires ffmpeg on PATH for the GIF (frames still render without it).
 * Nothing here ships with the plugin: the plugin itself stays zero-dependency.
 *
 * The captured blocks are verbatim output of the commands named next to them,
 * run from the repo root. Re-capture them if the underlying behavior changes;
 * test/smoke.mjs and the fixture's curl checks are the source of truth. The
 * sources emit no ANSI codes (plain console output), so coloring here is
 * semantic highlighting of verbatim text, not ANSI translation.
 */

import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- captured output

// $ echo '{"tool_name":"Edit","tool_input":{"file_path":"examples/legacy-shop/routes/billing.js"},"cwd":"examples/legacy-shop"}' \
//     | hooks/scripts/guard.js        (exit code 2)
const GUARD_BLOCK = `THIRD RAIL: examples/legacy-shop/routes/billing.js is a guarded path
(matched "**/routes/billing.js" from examples/legacy-shop/.third-rail.json.
This code class has burned this org before).
Before editing:
  1. Consult the runbook skill: third-rail:hardening-runbook
  2. Run the blast-radius agent on the change you intend to make
  3. Then create an acknowledgment file to proceed: touch .third-rail-ack
     (or set THIRD_RAIL_ACK=1 for the session)
The ack is a record that the runbook was consulted, not a bypass to reach for first.`;

// $ node test/smoke.mjs
const SMOKE = `ok   guard: blocks a sensitive Edit
ok   guard: allows a non-sensitive Edit
ok   guard: blocks a Write creating a not-yet-existing sensitive file
ok   guard: resolves a relative path against the payload cwd, not the process cwd
ok   guard: blocks when the guarded path is itself a symlink
ok   guard: blocks an innocent-looking symlink pointing at a guarded file
ok   guard: broken config still blocks default-token files, and says the config is out
ok   guard: broken config surfaces a systemMessage warning on allowed edits
ok   guard: acknowledgment file permits the edit
ok   guard: pathological glob fails open without hanging
ok   tracer: fixture output matches the committed golden map
ok   tracer: multi-target mount keeps every target, in argument order
ok   tracer: router.use is mapped with its owner
ok   tracer: same-line entries keep source order
ok   tracer: two parsers on one line both survive
ok   tracer: a route on a line containing a string with an apostrophe is not dropped
ok   wiring: hook matcher is the owned list
ok   wiring: hook command path exists and is executable
ok   wiring: agent allowed-tools include Skill (its step 5 depends on it)
ok   wiring: agent report template carries the caller relay line
ok   wiring: .claude-plugin/plugin.json parses
ok   wiring: .claude-plugin/marketplace.json parses
ok   wiring: examples/legacy-shop/.third-rail.json parses
ok   wiring: all 15 file:line references in FIXTURE_DEFECTS.md exist

all 24 checks passed`;

// $ cd examples/legacy-shop && npm start   (then, from another shell:)
const LIVE_BUGS = [
  { cmd: `curl -s -X POST localhost:3459/api/webhooks/payments \\
    -H 'Content-Type: application/json' \\
    -d '{"type":"payment.succeeded","id":"evt_forged"}'`,
    out: `{"received":true}`,
    note: '# forged, unsigned event: accepted' },
  { cmd: `curl -s -X POST localhost:3459/api/billing/refund \\
    -H 'Content-Type: application/json' \\
    -d '{"orderId":"ord_1","amount":9999}'`,
    out: `{"refunded":true,"orderId":"ord_1","amount":9999}`,
    note: '# no credentials: money moves' },
  { cmd: `curl -s -X POST localhost:3459/api/billing/charge`,
    out: `{"error":"auth required"}`,
    note: '# the sibling route, guarded' }
];

// server log line printed by the fixture during the forged-webhook request
const SERVER_LOG_LINE = 'webhook signature mismatch, processing anyway';

// ---------------------------------------------------------------- themes

// GitHub Primer palette so the frames sit naturally on github.com in both themes.
const THEMES = {
  dark: {
    canvas: 'transparent', frame: '#161b22', border: '#30363d', chromeBg: '#21262d',
    text: '#e6edf3', dim: '#8b949e', green: '#3fb950', red: '#f85149',
    amber: '#d29922', blue: '#79c0ff', purple: '#d2a8ff', shadow: 'rgba(0,0,0,0.5)'
  },
  light: {
    canvas: 'transparent', frame: '#ffffff', border: '#d0d7de', chromeBg: '#f6f8fa',
    text: '#1f2328', dim: '#656d76', green: '#1a7f37', red: '#cf222e',
    amber: '#9a6700', blue: '#0550ae', purple: '#8250df', shadow: 'rgba(140,149,159,0.3)'
  }
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function frameHtml(theme, title, bodyHtml, widthPx) {
  const t = THEMES[theme];
  return `<!doctype html><meta charset="utf-8"><style>
    * { margin: 0; box-sizing: border-box; }
    body { background: ${t.canvas}; padding: 24px; width: ${widthPx + 48}px; }
    .term {
      width: ${widthPx}px; background: ${t.frame};
      border: 1px solid ${t.border}; border-radius: 10px;
      box-shadow: 0 8px 28px ${t.shadow};
      overflow: hidden;
      font-family: "JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .chrome {
      display: flex; align-items: center; gap: 8px;
      background: ${t.chromeBg}; border-bottom: 1px solid ${t.border};
      padding: 10px 14px;
    }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .title { flex: 1; text-align: center; color: ${t.dim}; font-size: 12px; margin-right: 44px; }
    pre {
      padding: 18px 20px 20px; font-size: 13px; line-height: 1.55;
      color: ${t.text}; white-space: pre-wrap; word-break: break-word;
    }
    .g { color: ${t.green}; } .r { color: ${t.red}; } .a { color: ${t.amber}; }
    .b { color: ${t.blue}; } .p { color: ${t.purple}; } .d { color: ${t.dim}; }
    .bold { font-weight: 700; }
  </style>
  <div class="term">
    <div class="chrome">
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="title">${esc(title)}</span>
    </div>
    <pre>${bodyHtml}</pre>
  </div>`;
}

// ---------------------------------------------------------------- semantic highlighters

function highlightGuard(text) {
  return esc(text)
    .replace(/^THIRD RAIL:/, '<span class="r bold">THIRD RAIL:</span>')
    .replace(/(examples\/legacy-shop\/routes\/billing\.js)/, '<span class="a">$1</span>')
    .replace(/(third-rail:hardening-runbook)/, '<span class="b">$1</span>')
    .replace(/(blast-radius agent)/, '<span class="b">$1</span>')
    .replace(/(touch \.third-rail-ack)/, '<span class="g">$1</span>')
    .replace(/(THIRD_RAIL_ACK=1)/, '<span class="g">$1</span>');
}

function highlightSmoke(text) {
  return esc(text)
    .replace(/^ok /gm, '<span class="g">ok</span> ')
    .replace(/^(all 24 checks passed)$/m, '<span class="g bold">$1</span>')
    .replace(/^(guard|tracer|wiring)(?=:)/gm, '<span class="d">$1</span>');
}

function highlightLiveBugs() {
  return LIVE_BUGS.map(({ cmd, out, note }) => {
    const okish = out.includes('error');
    return `<span class="d">${esc(note)}</span>\n<span class="b">$</span> ${esc(cmd)}\n<span class="${okish ? 'g' : 'r'}">${esc(out)}</span>`;
  }).join('\n\n') + `\n\n<span class="d"># meanwhile, in the server log:</span>\n<span class="a">${esc(SERVER_LOG_LINE)}</span>`;
}

// ---------------------------------------------------------------- static screenshots

async function shootStatics(browser) {
  const jobs = [
    { name: 'guard-block', title: 'third-rail — PreToolUse guard', width: 760,
      body: (t) => `<span class="d"># Claude tries: Edit(examples/legacy-shop/routes/billing.js)</span>\n\n${highlightGuard(GUARD_BLOCK)}\n\n<span class="d">hook exit code: 2 — the edit never happened</span>` },
    { name: 'live-bugs', title: 'examples/legacy-shop — the seeded bugs are live', width: 760,
      body: () => highlightLiveBugs() },
    { name: 'smoke', title: 'node test/smoke.mjs', width: 760,
      body: () => `<span class="b">$</span> node test/smoke.mjs\n${highlightSmoke(SMOKE)}` }
  ];

  for (const job of jobs) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ deviceScaleFactor: 3 });
      await page.setContent(frameHtml(theme, job.title, job.body(theme), job.width));
      const el = page.locator('.term');
      await el.screenshot({ path: path.join(OUT, `${job.name}-${theme}.png`), omitBackground: false });
      await page.close();
      console.log(`wrote assets/${job.name}-${theme}.png`);
    }
  }
}

// ---------------------------------------------------------------- animated demo

// A scripted replay of the real session: the ask, the block, the proof.
// Text content is the captured output above; only the typing is simulated.
const DEMO_W = 640, DEMO_H = 400, FPS = 10, SECONDS = 12;

function demoScript() {
  const ask = 'Add a customer email notification to the refund endpoint in routes/billing.js';
  const frames = [];
  const push = (html, holdFrames) => { for (let i = 0; i < holdFrames; i++) frames.push(html); };

  const prompt = `<span class="b">&gt;</span> `;
  // 1. type the ask (~3s)
  const typeFrames = 30;
  for (let i = 1; i <= typeFrames; i++) {
    const n = Math.round((ask.length * i) / typeFrames);
    frames.push(`${prompt}${esc(ask.slice(0, n))}<span class="d">▌</span>`);
  }
  const asked = `${prompt}${esc(ask)}`;
  // 2. tool attempt + block (~5.5s)
  const attempt = `${asked}\n\n<span class="d">⏺ Edit(examples/legacy-shop/routes/billing.js)</span>`;
  push(attempt, 6);
  const blocked = `${attempt}\n\n${highlightGuard(GUARD_BLOCK)}`;
  push(blocked, 49);
  // 3. payoff line (~3.5s)
  const payoff = `${blocked}\n\n<span class="g bold">The guard fired before the edit happened.</span> <span class="d">Deterministic, out of process,\nfails open on its own bugs. Runbook next, then the blast-radius review.</span>`;
  push(payoff, 35);
  return frames.slice(0, FPS * SECONDS);
}

async function shootDemo(browser, theme) {
  const frames = demoScript();
  const dir = path.join(OUT, `.frames-${theme}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.setContent(frameHtml(theme, 'claude — inside examples/legacy-shop', '', DEMO_W));
  await page.evaluate(([w, h]) => {
    const pre = document.querySelector('pre');
    pre.style.width = `${w}px`;
    pre.style.height = `${h}px`;
    pre.style.fontSize = '12px';
  }, [DEMO_W, DEMO_H]);

  for (let i = 0; i < frames.length; i++) {
    await page.evaluate((html) => { document.querySelector('pre').innerHTML = html; }, frames[i]);
    await page.locator('.term').screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) });
  }
  await page.close();

  const gif = path.join(OUT, `demo-${theme}.gif`);
  const filter = `fps=${FPS},split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  const r = spawnSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'),
    '-vf', filter, '-loop', '0', gif], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) {
    console.error(`ffmpeg failed for ${theme}: ${(r.stderr || '').slice(-400)}`);
    return;
  }
  console.log(`wrote assets/demo-${theme}.gif (${(statSync(gif).size / 1024).toFixed(0)} KB)`);
}

// ---------------------------------------------------------------- main

const browser = await chromium.launch();
await shootStatics(browser);
await shootDemo(browser, 'dark');
await shootDemo(browser, 'light');
await browser.close();

let total = 0;
for (const f of ['guard-block-dark.png', 'guard-block-light.png', 'live-bugs-dark.png',
  'live-bugs-light.png', 'smoke-dark.png', 'smoke-light.png', 'demo-dark.gif', 'demo-light.gif']) {
  try { total += statSync(path.join(OUT, f)).size; } catch {}
}
console.log(`total raster weight: ${(total / 1024 / 1024).toFixed(2)} MB`);
