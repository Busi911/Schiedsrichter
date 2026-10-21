// Run with: node --test .claude/hooks/guard-dangerous-bash.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateCommand } = require('./guard-dangerous-bash.js');

// cwd doesn't matter for these cases since every command gives an explicit
// branch — resolveCurrentBranch() is never reached.
const opts = { cwd: __dirname };

test('blocks force-push with explicit main branch', () => {
  assert.match(
    evaluateCommand('git push origin main --force', opts) || '',
    /Force-pushing/
  );
});

test('blocks -f shorthand onto master', () => {
  assert.match(
    evaluateCommand('git push origin master -f', opts) || '',
    /Force-pushing/
  );
});

test('blocks --force-with-lease onto main', () => {
  assert.match(
    evaluateCommand('git push origin main --force-with-lease', opts) || '',
    /Force-pushing/
  );
});

test('blocks remote delete of main', () => {
  assert.match(
    evaluateCommand('git push origin --delete main', opts) || '',
    /Deleting/
  );
});

test('blocks local branch -D of master', () => {
  assert.match(
    evaluateCommand('git branch -D master', opts) || '',
    /Deleting/
  );
});

test('allows force-push to an unrelated feature branch', () => {
  assert.equal(evaluateCommand('git push origin feature/update-main-nav --force', opts), null);
});

test('allows plain git status', () => {
  assert.equal(evaluateCommand('git status', opts), null);
});

test('allows a command that only quotes the dangerous words as text', () => {
  assert.equal(
    evaluateCommand("echo 'remember: never do git push origin main --force' >> notes.txt", opts),
    null
  );
});

test('allows force-push to main chained after an unrelated command', () => {
  // chained invocations are split on &&/;/| and evaluated independently
  assert.match(
    evaluateCommand('echo hi && git push origin main --force', opts) || '',
    /Force-pushing/
  );
});

test('does not block a non-force push to main', () => {
  assert.equal(evaluateCommand('git push origin main', opts), null);
});

test('resolves the real current branch for a bare force-push (no branch in the command text)', () => {
  // Exercises the `git rev-parse --abbrev-ref HEAD` path for real, against
  // this repo's actual checkout, instead of asserting on faked state.
  const { execFileSync } = require('node:child_process');
  const actualBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: __dirname,
    encoding: 'utf8',
  }).trim().toLowerCase();

  const result = evaluateCommand('git push --force', { cwd: __dirname });
  if (actualBranch === 'main' || actualBranch === 'master') {
    assert.match(result || '', /Force-pushing/);
  } else {
    assert.equal(result, null);
  }
});
