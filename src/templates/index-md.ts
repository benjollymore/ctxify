import { basename } from 'node:path';
import { dumpYaml } from '../utils/yaml.js';
import type { ManifestData } from '../core/manifest.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface RepoTemplateData extends ManifestData {
  name: string;
  path: string;
}

// ── Generator ────────────────────────────────────────────────────────────

export function generateIndexTemplate(
  repos: RepoTemplateData[],
  workspacePath: string,
  mode: 'single-repo' | 'multi-repo' | 'mono-repo',
  metadata?: { generatedAt?: string; ctxifyVersion?: string; primaryRepo?: string },
): string {
  const scannedAt = metadata?.generatedAt ?? new Date().toISOString();
  const dirName = basename(workspacePath) || workspacePath;
  const isMultiRepo = mode === 'multi-repo';

  // ── Frontmatter ──
  const fm = dumpYaml({
    type: 'index',
    ctxify_version: metadata?.ctxifyVersion || undefined,
    mode,
    ...(isMultiRepo && metadata?.primaryRepo ? { primary_repo: metadata.primaryRepo } : {}),
    repos: repos.map((r) => r.name),
    scanned_at: scannedAt,
  });

  // ── Repo table ──
  const tableHeader = '| Repo | Language | Framework | Role |';
  const tableSep = '|------|----------|-----------|------|';
  const tableRows = repos.map((r) => {
    const overviewLink = isMultiRepo
      ? `${r.path}/.ctxify/overview.md`
      : `repos/${r.name}/overview.md`;
    return `| [${r.name}](${overviewLink}) | ${r.language || '--'} | ${r.framework || '--'} | <!-- TODO: role --> |`;
  });

  // ── Multi-repo note ──
  const workspaceNote =
    isMultiRepo && metadata?.primaryRepo
      ? `\n> Workspace context: see [\`${metadata.primaryRepo}/.ctxify/workspace.md\`](${metadata.primaryRepo}/.ctxify/workspace.md)\n`
      : '';

  if (isMultiRepo) {
    // Minimal hub for multi-repo — workspace.md in primary repo is the source of truth
    return `---
${fm.trimEnd()}
---

# ${dirName}
${workspaceNote}
## Repos

${tableHeader}
${tableSep}
${tableRows.join('\n')}
`;
  }

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
Example: "Adding a new rapid test field" → backend: validation schema, model type, threshold config; frontend: component list, Yup schemas, standards schema.
These are the highest-value context pieces — the tasks that trip up someone new to the codebase. -->
`;
}
