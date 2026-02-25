import type { Renderer } from './types.js';
import type { WorkspaceContext } from '../core/context.js';
import { heading, bulletList, table, yamlFrontmatter } from '../utils/markdown.js';

export function createRepoSummaryRenderers(ctx: WorkspaceContext): Renderer[] {
  return ctx.repos.map((repo) => ({
    outputPath: `.ctx/repo-${repo.name}.md`,

    render(ctx: WorkspaceContext): string {
      const lines: string[] = [];

      lines.push(yamlFrontmatter({
        generated_by: 'ctxify',
        repo: repo.name,
        last_scanned: ctx.metadata.generatedAt,
      }));
      lines.push('');

      lines.push(heading(1, repo.name));
      lines.push('');

      if (repo.description) {
        lines.push(repo.description);
        lines.push('');
      }

      // Overview
      lines.push(heading(2, 'Overview'));
      lines.push('');
      lines.push(bulletList([
        `**Language:** ${repo.language || 'unknown'}`,
        `**Framework:** ${repo.framework || 'none detected'}`,
        `**Manifest:** ${repo.manifestType || 'none'}`,
        `**Files:** ${repo.fileCount}`,
        `**Path:** ${repo.path}`,
      ]));
      lines.push('');

      // Key directories
      if (repo.keyDirs.length > 0) {
        lines.push(heading(2, 'Key Directories'));
        lines.push('');
        lines.push(bulletList(repo.keyDirs.map((d) => `\`${d}/\``)));
        lines.push('');
      }

      // Entry points
      if (repo.entryPoints.length > 0) {
        lines.push(heading(2, 'Entry Points'));
        lines.push('');
        lines.push(bulletList(repo.entryPoints.map((e) => `\`${e}\``)));
        lines.push('');
      }

      // Scripts
      if (Object.keys(repo.scripts).length > 0) {
        lines.push(heading(2, 'Scripts'));
        lines.push('');
        lines.push(table(
          ['Script', 'Command'],
          Object.entries(repo.scripts).map(([name, cmd]) => [
            `\`${name}\``,
            `\`${cmd}\``,
          ]),
        ));
        lines.push('');
      }

      // API endpoints for this repo
      const repoEndpoints = ctx.apiEndpoints.filter((e) => e.repo === repo.name);
      if (repoEndpoints.length > 0) {
        lines.push(heading(2, 'API Endpoints'));
        lines.push('');
        lines.push(table(
          ['Method', 'Path', 'File'],
          repoEndpoints.map((ep) => [ep.method, `\`${ep.path}\``, ep.file]),
        ));
        lines.push('');
      }

      // Conventions
      const repoConventions = ctx.conventions.filter((c) => c.repo === repo.name);
      if (repoConventions.length > 0) {
        lines.push(heading(2, 'Conventions'));
        lines.push('');
        lines.push(bulletList(repoConventions.map((c) => `**${c.category}:** ${c.description}`)));
        lines.push('');
      }

      // Dependencies (top 15)
      const deps = Object.keys(repo.dependencies);
      if (deps.length > 0) {
        lines.push(heading(2, 'Dependencies'));
        lines.push('');
        const shown = deps.slice(0, 15);
        lines.push(bulletList(shown.map((d) => `\`${d}\``)));
        if (deps.length > 15) {
          lines.push(`\n*...and ${deps.length - 15} more*`);
        }
        lines.push('');
      }

      return lines.join('\n');
    },
  }));
}
