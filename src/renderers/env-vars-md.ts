import type { Renderer } from './types.js';
import { heading, table, yamlFrontmatter } from '../utils/markdown.js';

export const envVarsMdRenderer: Renderer = {
  outputPath: '.ctx/env-vars.md',

  render(ctx) {
    const lines: string[] = [];

    lines.push(yamlFrontmatter({
      generated_by: 'ctxify',
      last_scanned: ctx.metadata.generatedAt,
    }));
    lines.push('');

    lines.push(heading(1, 'Environment Variables'));
    lines.push('');
    lines.push('> Names only — values are never captured.');
    lines.push('');

    if (ctx.envVars.length === 0) {
      lines.push('No environment variables detected.');
      return lines.join('\n');
    }

    // Shared env vars (across repos) first
    const shared = ctx.envVars.filter((e) => e.repos.length > 1);
    if (shared.length > 0) {
      lines.push(heading(2, 'Shared Across Repos'));
      lines.push('');
      lines.push(table(
        ['Variable', 'Repos', 'Sources'],
        shared.map((e) => [
          `\`${e.name}\``,
          e.repos.join(', '),
          e.sources.map((s) => `${s.repo}/${s.file} (${s.type})`).slice(0, 3).join(', '),
        ]),
      ));
      lines.push('');
    }

    // Per-repo env vars
    const byRepo = new Map<string, typeof ctx.envVars>();
    for (const envVar of ctx.envVars) {
      for (const repo of envVar.repos) {
        if (!byRepo.has(repo)) byRepo.set(repo, []);
        byRepo.get(repo)!.push(envVar);
      }
    }

    for (const [repoName, vars] of byRepo) {
      const repoOnly = vars.filter((v) => v.repos.length === 1);
      if (repoOnly.length > 0) {
        lines.push(heading(2, repoName));
        lines.push('');
        lines.push(table(
          ['Variable', 'Source'],
          repoOnly.map((e) => [
            `\`${e.name}\``,
            e.sources.filter((s) => s.repo === repoName).map((s) => `${s.file} (${s.type})`).slice(0, 2).join(', '),
          ]),
        ));
        lines.push('');
      }
    }

    return lines.join('\n');
  },
};
