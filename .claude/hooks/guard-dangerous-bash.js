#!/usr/bin/env node
// PreToolUse guard for Bash/PowerShell: blocks the handful of git operations
// that are hard to reverse and almost never intentional in this repo
// (force-pushing over main/master, deleting that branch locally or on the
// remote). Everything else is left to the normal permission prompts.
//
// Deliberately resolves the *actual* current branch via `git rev-parse`
// instead of just scanning the command text for the words "main"/"master" —
// the most common dangerous case is a bare `git push --force` while sitting
// on main, which never mentions the branch name at all.

const { execFileSync } = require('node:child_process');

const PROTECTED = new Set(['main', 'master']);

function isProtectedName(name) {
  return !!name && PROTECTED.has(name.toLowerCase());
}

// "HEAD:main" -> "main", "refs/heads/main" -> "main", "main" -> "main"
function normalizeRef(ref) {
  const dest = ref.includes(':') ? ref.slice(ref.indexOf(':') + 1) : ref;
  return dest.replace(/^refs\/heads\//, '');
}

function getCurrentBranch(cwd) {
  try {
    const out = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === 'HEAD' ? null : out; // detached HEAD: no branch is being updated
  } catch {
    return null; // not a git repo, or git unavailable — fail open, nothing to protect
  }
}

function tokenize(part) {
  // Good enough for plain git invocations; doesn't attempt full shell quoting.
  return part.trim().split(/\s+/).filter(Boolean);
}

// Returns { isPush, isDelete, remoteGiven, explicitRefs, hasForce, hasAll, hasMirror }
function parseGitInvocation(part) {
  const tokens = tokenize(part);
  if (tokens[0]?.toLowerCase() !== 'git') return null;
  const sub = tokens[1]?.toLowerCase();

  if (sub === 'push') {
    const rest = tokens.slice(2);
    const hasForce = rest.some(t => /^(--force|--force-with-lease(=.*)?|-f)$/i.test(t));
    const isDelete = rest.some(t => /^(--delete|-d)$/i.test(t));
    const hasAll = rest.some(t => /^--all$/i.test(t));
    const hasMirror = rest.some(t => /^--mirror$/i.test(t));
    const positional = rest.filter(t => !t.startsWith('-'));
    // `git push`, `git push origin`, `git push -f` -> no explicit branch given.
    // `git push origin main` -> positional[0] is the remote, rest are refspecs.
    const explicitRefs = positional.slice(1).map(normalizeRef);
    return { isPush: true, isDelete, hasForce, hasAll, hasMirror, explicitRefs, remoteGiven: positional.length > 0 };
  }

  if (sub === 'branch') {
    const rest = tokens.slice(2);
    const isDelete = rest.some(t => /^-([a-zA-Z]*[dD][a-zA-Z]*)$/.test(t) || /^--delete$/i.test(t));
    const explicitRefs = rest.filter(t => !t.startsWith('-')).map(normalizeRef);
    return { isPush: false, isDelete, hasForce: false, hasAll: false, hasMirror: false, explicitRefs, remoteGiven: false };
  }

  return null;
}

function evaluateCommand(command, { cwd } = {}) {
  const invocations = command
    .split(/&&|;|\|/)
    .map(part => part.trim())
    .map(parseGitInvocation)
    .filter(Boolean);

  if (invocations.length === 0) return null;

  let currentBranch; // lazily resolved, at most once
  const resolveCurrentBranch = () => {
    if (currentBranch === undefined) currentBranch = getCurrentBranch(cwd || process.cwd());
    return currentBranch;
  };

  for (const inv of invocations) {
    const targets = inv.explicitRefs.length > 0
      ? inv.explicitRefs
      : [resolveCurrentBranch()].filter(Boolean);

    const touchesProtected = targets.some(isProtectedName) ||
      ((inv.hasAll || inv.hasMirror) && inv.isPush); // can't rule out main/master, so assume it's included

    if (!touchesProtected) continue;

    if (inv.isPush && inv.hasForce && !inv.isDelete) {
      return 'Force-pushing over main/master is blocked by .claude/hooks/guard-dangerous-bash.js. If this is really intended, ask the user to confirm and run it themselves.';
    }
    if (inv.isDelete) {
      return 'Deleting the main/master branch is blocked by .claude/hooks/guard-dangerous-bash.js. If this is really intended, ask the user to confirm and run it themselves.';
    }
  }

  return null;
}

function main() {
  let raw = '';
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    let command = '';
    let cwd;
    try {
      const input = JSON.parse(raw || '{}');
      command = String(input?.tool_input?.command || '');
      cwd = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
    } catch {
      process.exit(0);
    }

    const denyReason = evaluateCommand(command, { cwd });
    if (denyReason) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: denyReason,
        },
      }));
    }
    process.exit(0);
  });
}

module.exports = { evaluateCommand, normalizeRef, parseGitInvocation };

if (require.main === module) {
  main();
}
