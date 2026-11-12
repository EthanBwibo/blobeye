#!/usr/bin/env node
/**
 * Creates the labels, milestones and issues in scripts/issues.json on GitHub.
 * Safe to run twice: anything that already exists (matched by name or title) is skipped.
 *
 * Needs the GitHub CLI, signed in:  gh auth login
 * Usage:  node scripts/github-setup.mjs            (uses the repo this folder points at)
 *         node scripts/github-setup.mjs owner/repo
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync(new URL('./issues.json', import.meta.url), 'utf8'));

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
}
function api(method, path, body) {
  const args = ['api', '-X', method, path];
  if (body) args.push('--input', '-');
  const out = gh(args, body ? JSON.stringify(body) : undefined);
  return out ? JSON.parse(out) : null;
}
function list(path) {
  const out = gh(['api', '--paginate', '--slurp', path]);
  return JSON.parse(out).flat();
}

const repo = process.argv[2] ?? gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
console.log(`Setting up ${repo}`);

const haveLabels = new Set(list(`repos/${repo}/labels?per_page=100`).map((l) => l.name));
for (const label of plan.labels) {
  if (haveLabels.has(label.name)) continue;
  api('POST', `repos/${repo}/labels`, label);
  console.log(`  label      ${label.name}`);
}

const milestoneNumber = new Map(
  list(`repos/${repo}/milestones?state=all&per_page=100`).map((m) => [m.title, m.number]),
);
for (const m of plan.milestones) {
  if (milestoneNumber.has(m.title)) continue;
  const made = api('POST', `repos/${repo}/milestones`, { title: m.title, description: m.description });
  milestoneNumber.set(m.title, made.number);
  console.log(`  milestone  ${m.title}`);
}

const haveIssues = new Set(
  list(`repos/${repo}/issues?state=all&per_page=100`)
    .filter((i) => !i.pull_request)
    .map((i) => i.title),
);
for (const issue of plan.issues) {
  if (haveIssues.has(issue.title)) continue;
  const made = api('POST', `repos/${repo}/issues`, {
    title: issue.title,
    body: issue.body,
    labels: issue.labels,
    milestone: milestoneNumber.get(issue.milestone),
  });
  if (issue.state === 'closed') {
    api('PATCH', `repos/${repo}/issues/${made.number}`, { state: 'closed', state_reason: 'completed' });
  }
  console.log(`  issue #${made.number}  ${issue.title}`);
}

for (const m of plan.milestones) {
  if (m.state === 'closed') api('PATCH', `repos/${repo}/milestones/${milestoneNumber.get(m.title)}`, { state: 'closed' });
}
console.log('Done.');
