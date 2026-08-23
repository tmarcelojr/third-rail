#!/usr/bin/env node
/*
 * third-rail guard: PreToolUse hook on the file-editing tools. The live list
 * of matched tools is owned by hooks/hooks.json; this script judges whatever
 * path it is handed.
 *
 * Deterministic fence around the codebase's third rail. If the edit target
 * matches a sensitive path (project .third-rail.json, else a conservative
 * default word list), block with exit 2 and tell Claude exactly how to
 * proceed safely.
 *
 * Zero dependencies: node stdlib only, readable start to finish in a few
 * minutes. The block is a speed bump against unconsidered changes, not access
 * control; the acknowledgment file records that the runbook was consulted.
 *
 * Robustness stance: this script runs on every edit, so its own bugs must
 * never brick the editor loop. Malformed stdin, junk config entries, and
 * pathological glob patterns all fail OPEN, never closed. A config that
 * exists but cannot be used is surfaced to the user (see main), never
 * silently swapped for the defaults.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Defaults are deliberately conservative: whole-word segment tokens, applied
// to code files only, so an unconfigured install does not block AUTHORS,
// authors-list.js, or session-notes.md in unrelated repos. Projects tune this
// precisely with .third-rail.json globs.
const DEFAULT_TOKENS = new Set([
  'auth',
  'billing',
  'payment',
  'payments',
  'webhook',
  'webhooks',
  'stripe',
  'checkout',
  'refund',
  'refunds',
  'entitlement',
  'entitlements',
  'session',
  'sessions'
]);

const DEFAULT_CODE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts',
  '.py', '.rb', '.go', '.java', '.php', '.cs'
]);

const ACK_FILE = '.third-rail-ack';
const CONFIG_FILE = '.third-rail.json';
const MAX_PATTERN_LENGTH = 500;
const MAX_WILDCARDS = 10;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Minimal glob: ** crosses directories, * stays within a segment.
// Patterns with too many wildcards fall back to plain substring matching so a
// pathological pattern cannot backtrack the regex engine into the hook timeout.
function matchesGlob(pattern, target) {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) {
    return false;
  }
  const stars = (pattern.match(/\*/g) || []).length;
  if (stars > MAX_WILDCARDS) {
    const literal = pattern.replace(/\*/g, '');
    return literal.length > 0 && target.toLowerCase().includes(literal.toLowerCase());
  }
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i++;
        if (pattern[i + 1] === '/') i++;
      } else {
        out += '[^/]*';
      }
    } else if ('\\^$.|?+()[]{}'.includes(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  try {
    return new RegExp('(^|/)' + out + '$', 'i').test(target);
  } catch {
    return false;
  }
}

// Default matching: split each path segment into words (dots, dashes,
// underscores, camelCase boundaries) and require an exact word from the
// token list. "paymentService.js" matches (payment); "authors-list.js"
// does not (authors is not auth).
function matchesDefaultTokens(target) {
  const ext = path.extname(target).toLowerCase();
  if (!DEFAULT_CODE_EXTENSIONS.has(ext)) return null;
  for (const segment of target.split('/')) {
    const words = segment
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    for (const word of words) {
      if (DEFAULT_TOKENS.has(word)) return word;
    }
  }
  return null;
}

function findUp(startDir, fileName, maxLevels = 10) {
  let dir = startDir;
  for (let i = 0; i < maxLevels; i++) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Returns { patterns, configPath, configProblem }. A config that exists but
// cannot be used is reported back to main as configProblem; main surfaces it
// to the user whether or not anything blocks, because for a team whose org
// config IS the control surface, a typo that quietly reinstates a stranger's
// policy is worse than a loud failure.
function loadConfig(fileDirs, cwd) {
  let configPath = null;
  for (const dir of fileDirs) {
    configPath = findUp(dir, CONFIG_FILE);
    if (configPath) break;
  }
  if (!configPath && cwd) configPath = findUp(cwd, CONFIG_FILE, 3);
  if (!configPath) return { patterns: null, configPath: null, configProblem: null };

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return { patterns: null, configPath, configProblem: `could not be parsed (${err.message})` };
  }

  if (!Array.isArray(config.sensitivePaths)) {
    return { patterns: null, configPath, configProblem: 'has no sensitivePaths array' };
  }

  const patterns = config.sensitivePaths.filter((p) => typeof p === 'string' && p.length > 0);

  // An explicit empty list is a decision, not a mistake: this repo has no
  // sensitive paths, so the guard stays out of the way.
  if (config.sensitivePaths.length === 0) {
    return { patterns: [], configPath, configProblem: null };
  }
  if (patterns.length === 0) {
    return { patterns: null, configPath, configProblem: 'sensitivePaths contained no usable string patterns' };
  }
  return { patterns, configPath, configProblem: null };
}

// The acknowledgment is scoped on purpose: it must sit next to the project's
// .third-rail.json (the config it acknowledges) or in the working directory.
// It deliberately does NOT walk arbitrary ancestors, so one stray ack far up
// the tree cannot silently disable the guard for everything beneath it.
function isAcknowledged(configPath, cwd) {
  if (process.env.THIRD_RAIL_ACK === '1') return true;
  const dirs = [];
  if (configPath) dirs.push(path.dirname(configPath));
  if (cwd) dirs.push(cwd);
  return dirs.some((dir) => {
    try {
      return fs.existsSync(path.join(dir, ACK_FILE));
    } catch {
      return false;
    }
  });
}

function truncate(value, max = 60) {
  const s = String(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function block(shownPath, reason) {
  process.stderr.write(
    [
      `THIRD RAIL: ${shownPath} is a guarded path (${reason}).`,
      'Before editing:',
      '  1. Consult the runbook skill: third-rail:hardening-runbook',
      '  2. Run the blast-radius agent on the change you intend to make',
      `  3. Then create an acknowledgment file to proceed: touch ${ACK_FILE}`,
      '     (or set THIRD_RAIL_ACK=1 for the session)',
      'The ack is a record that the runbook was consulted, not a bypass to reach for first.'
    ].join('\n') + '\n'
  );
  process.exit(2);
}

function main() {
  let input;
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0); // Malformed input: do not block on a guard bug.
  }

  if (!input || typeof input !== 'object') process.exit(0);
  const toolInput = input.tool_input || {};
  const rawPath = toolInput.file_path || toolInput.filePath || '';
  if (!rawPath || typeof rawPath !== 'string') process.exit(0);

  // The session's cwd, read BEFORE any resolution: a relative path must
  // resolve against the repo the engineer is working in, not against
  // wherever the hook process happens to be running.
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();

  // Matching runs against BOTH the resolved path and its realpath. The
  // resolved path catches routes/sub/../billing.js and a guarded path that is
  // itself a symlink (realpath alone would rewrite it out of the config's
  // globs); the realpath catches an innocent-looking symlink pointing AT a
  // guarded file. Sensitivity is keyed to path patterns, so a name that
  // matches the org's glob is sensitive by definition, wherever the inode is.
  const resolved = (path.isAbsolute(rawPath)
    ? path.normalize(rawPath)
    : path.resolve(cwd, rawPath)
  ).replace(/\\/g, '/');
  let real = resolved;
  try {
    real = fs.realpathSync(resolved).replace(/\\/g, '/');
  } catch {
    // Target does not exist yet (a Write creating a new file). The resolved
    // path is still the right thing to match against.
  }
  const candidates = real === resolved ? [resolved] : [resolved, real];

  const configDirs = [...new Set(candidates.map((c) => path.dirname(c)))];
  const { patterns, configPath, configProblem } = loadConfig(configDirs, cwd);

  let reason = null;
  if (patterns) {
    for (const candidate of candidates) {
      const matched = patterns.find((pattern) => matchesGlob(pattern, candidate));
      if (matched) {
        reason = `matched "${truncate(matched)}" from ${configPath}. This code class has burned this org before`;
        break;
      }
    }
  } else {
    for (const candidate of candidates) {
      const word = matchesDefaultTokens(candidate);
      if (word) {
        reason = configProblem
          ? `filename contains the sensitive word "${word}" from third-rail's default list. Note: ${configPath} ${configProblem}, so your repo's own rules are NOT in effect; fix that file to restore them`
          : `filename contains the sensitive word "${word}" from third-rail's default list; no ${CONFIG_FILE} found, add one to tune this to your repo`;
        break;
      }
    }
  }

  if (!reason) {
    if (configProblem) {
      // Nothing blocked, but the org's config is broken and its rules are not
      // in effect. Exit-0 stderr is invisible in the hook harness, so the
      // warning rides the documented systemMessage channel, which the harness
      // shows to the user without blocking the edit.
      process.stdout.write(
        JSON.stringify({
          systemMessage: `third-rail: ${configPath} ${configProblem}. Your repo's sensitive-path rules are NOT in effect (only third-rail's default word list is active). Fix that file to restore them.`
        }) + '\n'
      );
    }
    process.exit(0);
  }

  if (isAcknowledged(configPath, cwd)) {
    process.stderr.write(`third-rail: sensitive path edited under acknowledgment.\n`);
    process.exit(0);
  }

  const shownPath = real === resolved ? resolved : `${resolved} (resolves to ${real})`;
  block(shownPath, reason);
}

try {
  main();
} catch (err) {
  // A guard bug must never brick the editor loop: fail open, but say so.
  process.stderr.write(`third-rail guard error, failing open: ${err.message}\n`);
  process.exit(0);
}
