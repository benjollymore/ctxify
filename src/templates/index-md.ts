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
    scanned_at: scannedAt,
    workspace: workspacePath,
    mode,
    totals: {
      repos: repos.length,
      endpoints: 0,
      shared_types: 0,
      env_vars: 0,
    },
  });

  // ── Repo table ──
  const tableHeader = '| Repo | Language | Framework | Files | Entry points |';
  const tableSep = '|------|----------|-----------|-------|--------------|';
  const tableRows = repos.map((r) => {
    const entries = r.entryPoints.map((e) => `\`${e}\``).join(', ') || '--';
    return `| ${r.name} | ${r.language || '--'} | ${r.framework || '--'} | ${r.fileCount} | ${entries} |`;
  });

  // ── Shard links ──
  const shardLinks: string[] = [];
  for (const r of repos) {
    shardLinks.push(`- [${r.name}](repo-${r.name}.md)`);
    shardLinks.push(`- [${r.name} endpoints](endpoints-${r.name}.md)`);
    shardLinks.push(`- [${r.name} schemas](schemas-${r.name}.md)`);
  }
  shardLinks.push('- [Shared types](types.md)');
  shardLinks.push('- [Environment variables](env.md)');
  shardLinks.push('- [Topology](topology.md)');
  shardLinks.push('- [Pending questions](questions.md)');
  shardLinks.push('- [Analysis checklist](analysis.md)');

  return `---
${fm.trimEnd()}
---

# Workspace: ${dirName}

<!-- TODO: Agent — write a 2-3 sentence overview of what this workspace does, who it serves, and how the repos relate. -->

## Repos

${tableHeader}
${tableSep}
${tableRows.join('\n')}

## Relationships

<!-- TODO: Agent — describe how these repos depend on each other (API calls, shared DB, event bus, shared types). -->

## What's available

${shardLinks.join('\n')}
`;
}
