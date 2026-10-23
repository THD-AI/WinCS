// When the last sub-issue of a parent closes, flag the parent for outcome review.
// The parent is never closed automatically: an epic closes after acceptance.

const LABEL = 'ready-for-acceptance';
const MARKER = '<!-- sub-issue-rollup:ready -->';

function decide({ action, parent }) {
  if (!parent || parent.state !== 'OPEN') return { kind: 'none' };
  const { total, completed } = parent.subIssuesSummary;
  const labelled = parent.labels.nodes.some((l) => l.name === LABEL);
  if (action === 'closed' && total > 0 && completed === total && !labelled) return { kind: 'ready', total };
  if (action === 'reopened' && labelled) return { kind: 'unready' };
  return { kind: 'none' };
}

async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const number = context.payload.issue.number;
  const result = await github.graphql(
    `query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){
      parent{number state subIssuesSummary{total completed} labels(first:50){nodes{name}}}}}}`,
    { o: owner, r: repo, n: number },
  );
  const parent = result.repository.issue.parent;
  const decision = decide({ action: context.payload.action, parent });

  if (decision.kind === 'ready') {
    await github.rest.issues.addLabels({ owner, repo, issue_number: parent.number, labels: [LABEL] });
    const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: parent.number, per_page: 100 });
    if (!comments.some((c) => (c.body || '').includes(MARKER))) {
      await github.rest.issues.createComment({
        owner, repo, issue_number: parent.number,
        body: `${MARKER}\nAll ${decision.total} sub-issues are closed (last: #${number}). Check the completion criteria above end to end, then close this issue.`,
      });
    }
    core.info(`#${parent.number} is ready for acceptance.`);
  } else if (decision.kind === 'unready') {
    await github.rest.issues.removeLabel({ owner, repo, issue_number: parent.number, name: LABEL });
    core.info(`#${number} reopened; removed ${LABEL} from #${parent.number}.`);
  }
}

module.exports = run;
module.exports.decide = decide;
