import { basename } from 'node:path';
import { dumpYaml } from '../utils/yaml.js';
import type { RepoTemplateData } from './index-md.js';

export function generateWorkspaceTemplate(
  repos: RepoTemplateData[],
  workspacePath: string,
  primaryRepo: string,
  metadata?: { generatedAt?: string; ctxifyVersion?: string },
): string {
  const scannedAt = metadata?.generatedAt ?? new Date().toISOString();
  const dirName = basename(workspacePath) || workspacePath;

  const fm = dumpYaml({
    type: 'workspace',
    ctxify_version: metadata?.ctxifyVersion || undefined,
    primary_repo: primaryRepo,
    repos: repos.map((r) => r.name),
    scanned_at: scannedAt,
  });

  const tableHeader = '| Repo | Language | Framework | Role |';
  const tableSep = '|------|----------|-----------|------|';
  const tableRows = repos.map((r) => {
    return `| ${r.name} | ${r.language || '--'} | ${r.framework || '--'} | <!-- TODO: role --> |`;
  });

  return `---
${fm.trimEnd()}
---

# ${dirName}

<!-- TODO: Agent — 2-3 sentences: what this workspace does, who it serves, how the repos relate. -->

## Repos

${tableHeader}
${tableSep}
${tableRows.join('\n')}

## Relationships

<!-- TODO: Agent — how do these repos connect? Shared DB, API calls, shared types, auth, event bus. 5-10 lines. -->

## Commands

<!-- TODO: Agent — essential commands per repo (build, test, dev). 1-2 lines each. -->

## Workflows

<!-- TODO: Agent — Document 2-5 common cross-repo tasks as step-by-step guides.
Format: task name, then which files to touch in each repo (with paths).
These are the highest-value context pieces — the tasks that trip up someone new to the codebase. -->
`;
}
