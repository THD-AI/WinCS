const config = require('../project-config.json');
const { issueReferences } = require('./pr-conventions.cjs');

// Same parser as the PR conventions check, so a reference that passes CI also
// moves the board: closing keywords anywhere in the body, outside code blocks.
function linkedIssueNumbers(body, owner, repo) {
  return issueReferences(body, owner, repo).closes;
}

function pullRequestStatus(pr) {
  if (pr.state === 'closed') return pr.merged ? 'Done' : 'Backlog';
  return pr.draft ? 'In progress' : 'In review';
}

async function syncProject({ github, context, core }) {
  const { owner, repo } = context.repo;
  if (`${owner}/${repo}` !== config.repository) throw new Error('Unexpected repository');
  let openPulls;
  const statuses = new Map();
  async function currentPullStatus(pr) {
    if (pr.state === 'closed' || pr.draft || !pr.node_id) return pullRequestStatus(pr);
    if (!statuses.has(pr.node_id)) {
      const result = await github.graphql(`query($id:ID!){node(id:$id){... on PullRequest{reviewDecision}}}`, { id: pr.node_id });
      statuses.set(pr.node_id, result.node?.reviewDecision === 'CHANGES_REQUESTED' ? 'In progress' : 'In review');
    }
    return statuses.get(pr.node_id);
  }
  async function activePulls() {
    if (!openPulls) openPulls = await github.paginate(github.rest.pulls.list, { owner, repo, state: 'open', per_page: 100 });
    return openPulls;
  }

  async function setItem(contentId, status, dates = {}) {
    // Auto-add can win the race with this workflow. Find existing items first,
    // and retry lookup if GitHub reports a duplicate after the initial query.
    async function findItem() {
      let after = null;
      do {
        // Query the content connection directly: the project's searchable
        // item list can lag newly added issues for several minutes.
        const result = await github.graphql(`query($content:ID!,$after:String){node(id:$content){... on Issue{projectItems(first:100,after:$after,includeArchived:true){nodes{id project{id}} pageInfo{hasNextPage endCursor}}} ... on PullRequest{projectItems(first:100,after:$after,includeArchived:true){nodes{id project{id}} pageInfo{hasNextPage endCursor}}}}}`, { content: contentId, after });
        const page = result.node.projectItems;
        const found = page.nodes.find(entry => entry.project.id === config.projectId);
        if (found) return found.id;
        after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
      } while (after);
    }
    let item = await findItem();
    if (!item) {
      try {
        const added = await github.graphql(`mutation($project:ID!,$content:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}}`, { project: config.projectId, content: contentId });
        item = added.addProjectV2ItemById.item.id;
      } catch (error) {
        item = await findItem();
        if (!item) throw error;
      }
    }
    await github.graphql(`mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}){projectV2Item{id}}}`, { project: config.projectId, item, field: config.statusFieldId, option: config.statusOptions[status] });
    if (dates.completed) {
      await github.graphql(`mutation($project:ID!,$item:ID!,$field:ID!,$date:Date!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{date:$date}}){projectV2Item{id}}}`, { project: config.projectId, item, field: config.completedDateFieldId, date: dates.completed });
    } else if (dates.clearCompleted) {
      await github.graphql(`mutation($project:ID!,$item:ID!,$field:ID!){clearProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field}){projectV2Item{id}}}`, { project: config.projectId, item, field: config.completedDateFieldId });
    }
    if (status === 'In progress' || status === 'In review') {
      const current = await github.graphql(`query($id:ID!){node(id:$id){... on ProjectV2Item{fieldValueByName(name:"Start date"){... on ProjectV2ItemFieldDateValue{date}}}}}`, { id: item });
      if (!current.node.fieldValueByName?.date) {
        await github.graphql(`mutation($project:ID!,$item:ID!,$field:ID!,$date:Date!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{date:$date}}){projectV2Item{id}}}`, { project: config.projectId, item, field: config.startDateFieldId, date: new Date().toISOString().slice(0, 10) });
      }
    }
  }

  async function syncIssue(issue, fallback) {
    if (issue.pull_request) return;
    if (issue.state === 'closed') return setItem(issue.node_id, 'Done', { completed: issue.closed_at.slice(0, 10) });
    const active = (await activePulls()).filter(pr => linkedIssueNumbers(pr.body, owner, repo).includes(issue.number));
    if (active.length) {
      // A task with an unfinished draft remains in progress even if another
      // PR for it is review-ready. A closed sibling cannot reset active work.
      const activeStatuses = await Promise.all(active.map(currentPullStatus));
      return setItem(issue.node_id, activeStatuses.includes('In progress') ? 'In progress' : 'In review', { clearCompleted: true });
    }
    if (fallback) await setItem(issue.node_id, fallback, { clearCompleted: true });
    // Unlinked open issues keep manually triaged Ready/Blocked/Backlog states.
  }

  async function syncPullRequest(pr) {
    await setItem(pr.node_id, await currentPullStatus(pr), pr.merged_at ? { completed: pr.merged_at.slice(0, 10) } : { clearCompleted: true });
    for (const number of linkedIssueNumbers(pr.body, owner, repo)) {
      const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: number });
      // A merge into another stack layer does not complete the child issue.
      await syncIssue(issue, pr.state === 'closed' && !pr.merged ? 'Ready' : pr.draft ? 'In progress' : 'In review');
    }
  }

  if (context.payload.pull_request) {
    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: context.payload.pull_request.number });
    await syncPullRequest(pr);
  } else if (context.payload.issue) {
    const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: context.payload.issue.number });
    await syncIssue(issue, context.payload.action === 'reopened' ? 'Ready' : context.payload.action === 'opened' ? 'Backlog' : undefined);
    // Labels/assignees must not overwrite deliberate Ready/Blocked choices.
  } else {
    for (const pr of await activePulls()) await syncPullRequest(pr);
    // Repair missed close events and dates too, rather than only open PRs.
    for await (const response of github.paginate.iterator(github.rest.issues.listForRepo, { owner, repo, state: 'all', per_page: 100 })) {
      for (const issue of response.data) await syncIssue(issue);
    }
  }
  core.info('Project metadata synchronized; no merge, deployment or issue-close action performed.');
}

module.exports = syncProject;
module.exports.linkedIssueNumbers = linkedIssueNumbers;
module.exports.pullRequestStatus = pullRequestStatus;
