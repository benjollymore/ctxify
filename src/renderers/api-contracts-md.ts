import type { Renderer } from './types.js';
import { heading, table, yamlFrontmatter } from '../utils/markdown.js';

export const apiContractsMdRenderer: Renderer = {
  outputPath: '.ctx/api-contracts.md',

  render(ctx) {
    const lines: string[] = [];

    lines.push(yamlFrontmatter({
      generated_by: 'ctxify',
      last_scanned: ctx.metadata.generatedAt,
    }));
    lines.push('');

    lines.push(heading(1, 'API Contracts'));
    lines.push('');

    if (ctx.apiEndpoints.length === 0) {
      lines.push('No API endpoints discovered.');
      return lines.join('\n');
    }

    // Group by repo
    const byRepo = new Map<string, typeof ctx.apiEndpoints>();
    for (const ep of ctx.apiEndpoints) {
      if (!byRepo.has(ep.repo)) byRepo.set(ep.repo, []);
      byRepo.get(ep.repo)!.push(ep);
    }

    for (const [repoName, endpoints] of byRepo) {
      lines.push(heading(2, repoName));
      lines.push('');
      lines.push(table(
        ['Method', 'Path', 'File', 'Line'],
        endpoints.map((ep) => [
          ep.method,
          `\`${ep.path}\``,
          ep.file,
          ep.line ? String(ep.line) : '—',
        ]),
      ));
      lines.push('');
    }

    return lines.join('\n');
  },
};
