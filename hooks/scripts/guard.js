#!/usr/bin/env node
/*
 * third-rail guard: PreToolUse hook on Edit|Write|MultiEdit.
 *
 * Deterministic fence around the codebase's third rail. If the edit target
 * matches a sensitive path (project .third-rail.json, else defaults), block
 * with exit 2 and tell Claude exactly how to proceed safely.
 *
 * Zero dependencies: node stdlib only, readable start to finish in two minutes.
 * The block is a speed bump against unconsidered changes, not access control;
 * the acknowledgment file records that the runbook was consulted on purpose.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SENSITIVE = [
  '**/billing/**',
  '**/*billing*',
  '**/*webhook*',
  '**/auth/**',
  '**/*auth*',
  '**/payments/**',
  '**/*payment*',
  '**/*session*'
];

const ACK_FILE = '.third-rail-ack';
const CONFIG_FILE = '.third-rail.json';

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Minimal glob: ** crosses directories, * stays within a segment.
function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        out += '[^/]*';
      }
    } else if ('\\^$.|?+()[]{}'.includes(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  return new RegExp('(^|/)' + out + '$', 'i');
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

function loadPatterns(fileDir, cwd) {
  const configPath =
    findUp(fileDir, CONFIG_FILE) || (cwd ? findUp(cwd, CONFIG_FILE, 3) : null);
  if (configPath) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (Array.isArray(config.sensitivePaths) && config.sensitivePaths.length > 0) {
        return { patterns: config.sensitivePaths, configPath };
      }
    } catch {
      // Unreadable config: fall through to defaults rather than failing open silently.
    }
  }
  return { patterns: DEFAULT_SENSITIVE, configPath: null };
}

function isAcknowledged(fileDir, cwd) {
  if (process.env.THIRD_RAIL_ACK === '1') return true;
  return Boolean(findUp(fileDir, ACK_FILE) || (cwd ? findUp(cwd, ACK_FILE, 3) : null));
}

function main() {
  let input;
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    // Malformed input: do not block on a guard bug.
    process.exit(0);
  }

  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.filePath || '';
  if (!filePath) process.exit(0);

  const normalized = String(filePath).replace(/\\/g, '/');
  const fileDir = path.dirname(normalized);
  const cwd = input.cwd || process.cwd();

  const { patterns, configPath } = loadPatterns(fileDir, cwd);
  const matched = patterns.find((pattern) => globToRegExp(pattern).test(normalized));
  if (!matched) process.exit(0);

  if (isAcknowledged(fileDir, cwd)) {
    // Acknowledged: allow, but leave a one-line trace in the transcript.
    process.stderr.write(
      `third-rail: sensitive path (${matched}) edited under acknowledgment.\n`
    );
    process.exit(0);
  }

  const configNote = configPath
    ? `matched "${matched}" from ${configPath}`
    : `matched default pattern "${matched}" (no ${CONFIG_FILE} found)`;

  process.stderr.write(
    [
      `THIRD RAIL: ${normalized} is a guarded path (${configNote}).`,
      'This code class has burned this org before. Before editing:',
      '  1. Consult the runbook skill: third-rail:hardening-runbook',
      '  2. Run the blast-radius agent on the change you intend to make',
      `  3. Then create an acknowledgment file to proceed: touch ${ACK_FILE}`,
      '     (or set THIRD_RAIL_ACK=1 for the session)',
      'The ack is a record that the runbook was consulted, not a bypass to reach for first.'
    ].join('\n') + '\n'
  );
  process.exit(2);
}

main();
