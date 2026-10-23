const test = require('node:test');
const assert = require('node:assert/strict');
const { checkTitle, issueReferences, evaluate } = require('./pr-conventions.cjs');
const { parseCommand, decideTake, slug, branchPrefix } = require('./issue-commands.cjs');
const { decide } = require('./sub-issue-rollup.cjs');

const O = 'THD-AI';
const R = 'WinCS';

test('accepts conventional titles with and without scope', () => {
  assert.deepEqual(checkTitle('feat(player): add ladder climbing'), []);
  assert.deepEqual(checkTitle('docs: explain /take'), []);
  assert.deepEqual(checkTitle('feat(stage)!: replace the collision format'), []);
});

test('accepts art commits and the stacked-PR prefix', () => {
  assert.deepEqual(checkTitle('art: hero movement sheets'), []);
  assert.deepEqual(checkTitle('[2/3] chore: add issue forms'), []);
  assert.equal(checkTitle('[2/3]chore: add issue forms').length, 1);
  assert.equal(checkTitle('[a/b] chore: add issue forms').length, 1);
});

test('rejects unknown types, missing summary, trailing period and long titles', () => {
  assert.equal(checkTitle('Update stuff').length, 1);
  assert.equal(checkTitle('feature(player): add ladders').length, 1);
  assert.equal(checkTitle('fix(enemies):').length, 1);
  assert.match(checkTitle('fix: keep the rover on its deck.').join(), /period/);
  assert.match(checkTitle(`docs: ${'x'.repeat(80)}`).join(), /at most 72/);
});

test('separates closing references from related references', () => {
  const body = 'Closes #34\nRefs #30\nPart of #16\nFixes https://github.com/THD-AI/WinCS/issues/36';
  assert.deepEqual(issueReferences(body, O, R), { closes: [34, 36], refs: [30, 16] });
});

test('ignores references in code blocks, HTML comments and other repositories', () => {
  const body = '<!-- Closes #1 -->\n```\nCloses #2\n```\nCloses https://github.com/other/repo/issues/3\nmentions #4';
  assert.deepEqual(issueReferences(body, O, R), { closes: [], refs: [] });
});

test('requires an issue link unless the PR is from a bot or labelled no-issue', () => {
  const pr = { title: 'docs: fix typo', body: 'typo', user: { login: 'student' }, labels: [] };
  assert.equal(evaluate(pr, O, R).problems.length, 1);
  assert.equal(evaluate({ ...pr, labels: [{ name: 'no-issue' }] }, O, R).problems.length, 0);
  assert.equal(evaluate({ ...pr, user: { login: 'dependabot[bot]' } }, O, R).problems.length, 0);
});

test('parses only a command on the first line', () => {
  assert.equal(parseCommand('/take'), 'take');
  assert.equal(parseCommand('  /DROP \nthanks'), 'drop');
  assert.equal(parseCommand('I will /take this'), null);
});

const issue = (over = {}) => ({ number: 40, title: '[M0-S12] Spike: what do the organisers allow and expect?', state: 'open', labels: [{ name: 'type:spike' }], assignees: [], ...over });

test('take assigns a free, unblocked issue and suggests a branch name', () => {
  const d = decideTake({ issue: issue(), login: 'student', openBlockers: [] });
  assert.equal(d.ok, true);
  assert.match(d.reply, /chore\/40-spike-what-do-the-organisers/);
});

test('take refuses epics, closed, assigned and blocked issues', () => {
  assert.equal(decideTake({ issue: issue({ labels: [{ name: 'type:epic' }] }), login: 's', openBlockers: [] }).ok, false);
  assert.equal(decideTake({ issue: issue({ state: 'closed' }), login: 's', openBlockers: [] }).ok, false);
  assert.match(decideTake({ issue: issue({ assignees: [{ login: 'x' }] }), login: 's', openBlockers: [] }).reply, /@x/);
  assert.match(decideTake({ issue: issue(), login: 's', openBlockers: [17, 39] }).reply, /#17, #39/);
});

test('branch prefix follows the issue type', () => {
  assert.equal(branchPrefix(['type:bug']), 'fix');
  assert.equal(branchPrefix(['type:story', 'area:player']), 'feature');
  assert.equal(branchPrefix(['type:story', 'area:art', 'area:player']), 'art');
  assert.equal(branchPrefix(['type:task', 'area:art', 'area:pipeline']), 'chore');
  assert.equal(branchPrefix(['type:task', 'area:docs']), 'docs');
  assert.equal(slug('[M1-S3] Walk up hills and slide down steep slopes'), 'walk-up-hills-and-slide');
});

const parent = (completed, total, labels = []) => ({ number: 16, state: 'OPEN', subIssuesSummary: { completed, total }, labels: { nodes: labels.map((name) => ({ name })) } });

test('flags the parent only when the last sub-issue closes', () => {
  assert.deepEqual(decide({ action: 'closed', parent: parent(9, 10) }), { kind: 'none' });
  assert.deepEqual(decide({ action: 'closed', parent: parent(10, 10) }), { kind: 'ready', total: 10 });
  assert.deepEqual(decide({ action: 'closed', parent: parent(10, 10, ['ready-for-acceptance']) }), { kind: 'none' });
  assert.deepEqual(decide({ action: 'closed', parent: null }), { kind: 'none' });
});

test('reopening a sub-issue withdraws readiness', () => {
  assert.deepEqual(decide({ action: 'reopened', parent: parent(9, 10, ['ready-for-acceptance']) }), { kind: 'unready' });
  assert.deepEqual(decide({ action: 'reopened', parent: { ...parent(9, 10), state: 'CLOSED' } }), { kind: 'none' });
});
