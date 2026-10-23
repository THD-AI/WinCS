// Comment commands on issues: `/take` assigns the commenter, `/drop` unassigns them.
// Keeps self-assignment open to every contributor without granting repository access.

const CONTRIBUTING = 'https://github.com/THD-AI/WinCS/blob/main/CONTRIBUTING.md';

function parseCommand(body) {
  const first = (body || '').trim().split(/\r?\n/)[0].trim().toLowerCase();
  if (first === '/take' || first === '/assign') return 'take';
  if (first === '/drop' || first === '/unassign') return 'drop';
  return null;
}

function slug(title) {
  return (title || '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-');
}

function branchPrefix(labels) {
  if (labels.includes('type:bug')) return 'fix';
  if (labels.includes('area:art') && labels.includes('type:story')) return 'art';
  if (labels.includes('area:docs') && !labels.includes('type:story')) return 'docs';
  if (labels.includes('type:task') || labels.includes('type:spike')) return 'chore';
  return 'feature';
}

// Decide what /take should do. `openBlockers` are issue numbers still open.
function decideTake({ issue, login, openBlockers }) {
  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const assignees = (issue.assignees || []).map((a) => a.login);
  if (issue.state !== 'open') return { ok: false, reply: 'This issue is closed, so there is nothing to take.' };
  if (labels.includes('type:epic')) return { ok: false, reply: 'Epics are not taken directly. Pick one of the sub-issues listed above and comment `/take` there.' };
  if (assignees.includes(login)) return { ok: false, reply: `You already have this one, @${login}.` };
  if (assignees.length > 0) return { ok: false, reply: `This is already assigned to @${assignees.join(', @')}. Ask in the thread whether they still need help, or pick another \`Ready\` issue.` };
  if (openBlockers.length > 0) {
    return { ok: false, reply: `This issue is still blocked by ${openBlockers.map((n) => `#${n}`).join(', ')}. Pick one of those, or another issue in the **Ready** column of the [project board](https://github.com/orgs/THD-AI/projects/7).` };
  }
  const branch = `${branchPrefix(labels)}/${issue.number}-${slug(issue.title)}`;
  return {
    ok: true,
    reply: [
      `Assigned to @${login}. Thanks!`,
      '',
      `1. Branch from \`main\`: \`git switch -c ${branch}\``,
      '2. Open a **draft PR** early with `Closes #' + issue.number + '` in the description; the board moves the card to *In progress*.',
      '3. Mark it ready for review when the acceptance criteria are met.',
      '',
      `Changed your mind? Comment \`/drop\`. Workflow details: [CONTRIBUTING](${CONTRIBUTING}).`,
    ].join('\n'),
  };
}

async function openBlockersOf(github, owner, repo, number) {
  const result = await github.graphql(
    'query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){issue(number:$n){blockedBy(first:20){nodes{number state}}}}}',
    { o: owner, r: repo, n: number },
  );
  return result.repository.issue.blockedBy.nodes.filter((i) => i.state === 'OPEN').map((i) => i.number);
}

async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const { issue, comment } = context.payload;
  if (issue.pull_request) return;
  const command = parseCommand(comment.body);
  if (!command) return;
  const login = comment.user.login;
  const reply = (body) => github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body });
  await github.rest.reactions.createForIssueComment({ owner, repo, comment_id: comment.id, content: 'eyes' });

  if (command === 'drop') {
    const assigned = (issue.assignees || []).some((a) => a.login === login);
    if (!assigned) return reply(`@${login}, you are not assigned to this issue.`);
    await github.rest.issues.removeAssignees({ owner, repo, issue_number: issue.number, assignees: [login] });
    return reply(`Unassigned @${login}. The issue is free for someone else to \`/take\`.`);
  }

  const decision = decideTake({ issue, login, openBlockers: await openBlockersOf(github, owner, repo, issue.number) });
  if (!decision.ok) return reply(decision.reply);
  const { data: updated } = await github.rest.issues.addAssignees({ owner, repo, issue_number: issue.number, assignees: [login] });
  if (!(updated.assignees || []).some((a) => a.login === login)) {
    core.warning(`GitHub did not accept ${login} as an assignee.`);
    return reply(`@${login} wants to take this issue, but GitHub would not assign them automatically. @${owner}, please assign manually.`);
  }
  return reply(decision.reply);
}

module.exports = run;
module.exports.parseCommand = parseCommand;
module.exports.decideTake = decideTake;
module.exports.slug = slug;
module.exports.branchPrefix = branchPrefix;
