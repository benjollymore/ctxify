import type { RepoTemplateData } from './index-md.js';

export function generateTopologyTemplate(repos: RepoTemplateData[]): string {
  const repoList = repos
    .map((r) => {
      const tech = [r.language, r.framework].filter(Boolean).join(' / ');
      return `- **${r.name}** — ${tech || 'unknown'}`;
    })
    .join('\n');

  return `# Workspace Topology

## Repos

${repoList}

## How they connect

<!-- TODO: Agent — describe the runtime and build-time connections between repos: API calls, shared databases, message queues, shared packages, deployment dependencies. -->
`;
}
