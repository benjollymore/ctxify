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
  metadata?: { generatedAt?: string; ctxifyVersion?: string },
): string {
  const scannedAt = metadata?.generatedAt ?? new Date().toISOString();
  const dirName = basename(workspacePath) || workspacePath;

  // ── Frontmatter ──
  const fm = dumpYaml({
    ctxify: '2.0',
    type: 'index',
    mode,
    repos: repos.map((r) => r.name),
    scanned_at: scannedAt,
  });

  // ── Repo table ──
  const tableHeader = '| Repo | Language | Framework | Role |';
  const tableSep = '|------|----------|-----------|------|';
  const tableRows = repos.map((r) => {
    return `| [${r.name}](repos/${r.name}/overview.md) | ${r.language || '--'} | ${r.framework || '--'} | <!-- TODO: role --> |`;
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
Example: "Adding a new rapid test field" → backend: validation schema, model type, threshold config; frontend: component list, Yup schemas, standards schema.
These are the highest-value context pieces — the tasks that trip up someone new to the codebase. -->
`;
}
