const test = require('node:test');
const assert = require('node:assert/strict');
const { linkedIssueNumbers, pullRequestStatus } = require('./project-sync.cjs');
const syncProject = require('./project-sync.cjs');
const config = require('../project-config.json');

test('links only explicit same-repository issue lines', () => {
  assert.deepEqual(linkedIssueNumbers('Issue: #17\nCloses https://github.com/THD-AI/WinCS/issues/18\nParent epic #16\nDependency #19', 'THD-AI', 'WinCS'), [17, 18]);
});
test('ignores foreign links, code examples, duplicates and malformed IDs', () => {
  assert.deepEqual(linkedIssueNumbers('Issue: https://github.com/other/repo/issues/1\n```\nCloses #2\n```\nIssue: #3\nCloses #3\nIssue: #4oops', 'THD-AI', 'WinCS'), [3]);
});
test('finds closing references in the middle of a sentence', () => {
  assert.deepEqual(linkedIssueNumbers('Disposable PR for #26. Closes #51', 'THD-AI', 'WinCS'), [51]);
  assert.deepEqual(linkedIssueNumbers('Refs #30\nFixes #36.', 'THD-AI', 'WinCS'), [36]);
});
test('draft and review-ready PRs have different project states', () => {
  assert.equal(pullRequestStatus({ state: 'open', draft: true }), 'In progress');
  assert.equal(pullRequestStatus({ state: 'open', draft: false }), 'In review');
});
test('closed-unmerged PR is not completed work', () => {
  assert.equal(pullRequestStatus({ state: 'closed', merged: false }), 'Backlog');
  assert.equal(pullRequestStatus({ state: 'closed', merged: true }), 'Done');
});

test('merging a stack layer does not complete its still-open issue', async () => {
  const updates = [];
  const pr = { node_id: 'pr-node', number: 7, state: 'closed', merged: true, merged_at: '2026-10-10T12:00:00Z', body: 'Closes #19' };
  const github = {
    graphql: async (query, variables) => {
      if (query.includes('projectItems(first:100')) return { node: { projectItems: { nodes: [], pageInfo: { hasNextPage: false } } } };
      if (query.includes('fieldValueByName')) return { node: { fieldValueByName: { date: '2026-10-10' } } };
      if (query.includes('addProjectV2ItemById')) return { addProjectV2ItemById: { item: { id: variables.content } } };
      updates.push(variables);
      return {};
    },
    rest: {
      pulls: { get: async () => ({ data: pr }), list() {} },
      issues: { get: async () => ({ data: { number: 19, node_id: 'issue-node', state: 'open' } }) },
    },
    paginate: async () => [],
  };
  await syncProject({ github, context: { repo: { owner: 'THD-AI', repo: 'WinCS' }, payload: { pull_request: pr } }, core: { info() {} } });
  assert.ok(updates.some(update => update.item === 'pr-node' && update.option === config.statusOptions.Done));
  assert.ok(updates.some(update => update.item === 'issue-node' && update.option === config.statusOptions['In review']));
  assert.ok(!updates.some(update => update.item === 'issue-node' && (update.option === config.statusOptions.Done || update.date)));
});

function harness({ pr, issue, active = [], duplicate = false, reviewDecision = null }) {
  const updates = [];
  let lookups = 0;
  const github = {
    graphql: async (query, variables) => {
      if (query.includes('reviewDecision')) return { node: { reviewDecision } };
      if (query.includes('projectItems(first:100')) {
        lookups++;
        return { node: { projectItems: { nodes: duplicate && lookups > 1 ? [{ id: 'existing-pr', project: { id: config.projectId } }] : [], pageInfo: { hasNextPage: false } } } };
      }
      if (query.includes('addProjectV2ItemById')) {
        if (duplicate) throw new Error('Content already exists in this project');
        return { addProjectV2ItemById: { item: { id: variables.content } } };
      }
      if (query.includes('fieldValueByName')) return { node: { fieldValueByName: { date: '2026-10-13' } } };
      updates.push(variables);
      return {};
    },
    rest: {
      pulls: { get: async () => ({ data: pr }), list() {} },
      issues: { get: async () => ({ data: issue }) },
    },
    paginate: async () => active,
  };
  const run = payload => syncProject({ github, context: { repo: { owner: 'THD-AI', repo: 'WinCS' }, payload }, core: { info() {} } });
  return { run, updates };
}

test('abandoning one PR cannot reset an issue with another active draft', async () => {
  const pr = { number: 54, node_id: 'pr', state: 'closed', merged: false, body: 'Closes #58' };
  const active = [{ number: 55, state: 'open', draft: true, body: 'Closes #58' }];
  const { run, updates } = harness({ pr, active, issue: { number: 58, node_id: 'issue', state: 'open' } });
  await run({ pull_request: pr });
  assert.ok(updates.some(v => v.item === 'issue' && v.option === config.statusOptions['In progress']));
  assert.ok(!updates.some(v => v.item === 'issue' && v.option === config.statusOptions.Ready));
});

test('a queued opened event rereads the now-closed issue and retains completion', async () => {
  const issue = { number: 58, node_id: 'issue', state: 'closed', closed_at: '2026-10-14T10:00:00Z' };
  const { run, updates } = harness({ issue });
  await run({ action: 'opened', issue: { number: 58, state: 'open' } });
  assert.ok(updates.some(v => v.option === config.statusOptions.Done));
  assert.ok(updates.some(v => v.date === '2026-10-14'));
  assert.ok(!updates.some(v => v.option === config.statusOptions.Backlog));
});

test('label events leave manually blocked unlinked work alone', async () => {
  const { run, updates } = harness({ issue: { number: 62, node_id: 'issue', state: 'open' } });
  await run({ action: 'labeled', issue: { number: 62 } });
  assert.deepEqual(updates, []);
});

test('native auto-add racing the script reuses the existing item', async () => {
  const pr = { number: 54, node_id: 'pr', state: 'open', draft: false, body: '' };
  const { run, updates } = harness({ pr, duplicate: true });
  await run({ pull_request: pr });
  assert.ok(updates.some(v => v.item === 'existing-pr' && v.option === config.statusOptions['In review']));
});

test('reconciliation retains changes-requested state for PR and delivery issue', async () => {
  const pr = { number: 54, node_id: 'pr', state: 'open', draft: false, body: 'Closes #58' };
  const { run, updates } = harness({ pr, active: [pr], reviewDecision: 'CHANGES_REQUESTED', issue: { number: 58, node_id: 'issue', state: 'open' } });
  await run({ pull_request: pr });
  for (const item of ['pr', 'issue']) {
    assert.ok(updates.some(v => v.item === item && v.option === config.statusOptions['In progress']));
    assert.ok(!updates.some(v => v.item === item && v.option === config.statusOptions['In review']));
  }
});

test('manual reconciliation repairs missed closures without resetting blocked work', async () => {
  const updates = [];
  // Use a separate adapter to exercise paginated repository reconciliation.
  const syncGithub = {
    graphql: async (query, variables) => {
      if (query.includes('projectItems(first:100')) return { node: { projectItems: { nodes: [], pageInfo: { hasNextPage: false } } } };
      if (query.includes('addProjectV2ItemById')) return { addProjectV2ItemById: { item: { id: variables.content } } };
      updates.push(variables);
      return {};
    },
    rest: { pulls: { list() {} }, issues: { listForRepo() {} } },
    paginate: Object.assign(async () => [], { iterator: async function* () {
      yield { data: [
        { number: 58, node_id: 'closed', state: 'closed', closed_at: '2026-10-14T10:00:00Z' },
        { number: 62, node_id: 'blocked', state: 'open' },
      ] };
    } }),
  };
  await syncProject({ github: syncGithub, context: { repo: { owner: 'THD-AI', repo: 'WinCS' }, payload: {} }, core: { info() {} } });
  assert.ok(updates.some(v => v.item === 'closed' && v.option === config.statusOptions.Done));
  assert.ok(updates.some(v => v.item === 'closed' && v.date === '2026-10-14'));
  assert.ok(!updates.some(v => v.item === 'blocked'));
});
