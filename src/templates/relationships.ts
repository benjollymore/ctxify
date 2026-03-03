import { dumpYaml } from '../utils/yaml.js';

// ── Types ────────────────────────────────────────────────────────────────

interface RelationshipsTemplateData {
  workspace: string;
  repos: string[];
  ctxifyVersion?: string;
}

// ── Generator ────────────────────────────────────────────────────────────

export function generateRelationshipsTemplate(data: RelationshipsTemplateData): string {
  const fm = dumpYaml({
    workspace: data.workspace,
    type: 'relationships',
    ctxify_version: data.ctxifyVersion || undefined,
  });

  const repoRows = data.repos.map((repo) => `| ${repo} | |`).join('\n');

  return (
    `---\n${fm.trimEnd()}\n---\n\n` +
    `# Relationships\n\n` +
    `Cross-repo dependencies and data flows. Document how repos interact.\n\n` +
    `| From | To | Type | Description |\n` +
    `|------|-----|------|-------------|\n` +
    `${repoRows}\n\n` +
    `<!-- TODO: Agent — complete the relationships table.\n` +
    `For each pair of repos that interact, add a row with:\n` +
    `- From: source repo\n` +
    `- To: target repo\n` +
    `- Type: dependency, api-consumer, shared-db, shared-types, or event\n` +
    `- Description: brief explanation of the relationship\n` +
    `Example: api-server depends on auth-service for login validation.\n` +
    `20-30 lines total. -->\n`
  );
}
