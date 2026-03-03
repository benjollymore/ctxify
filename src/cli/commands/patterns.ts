import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { resolveRepoCtxDir } from '../../core/paths.js';
import { generatePatternsTemplate } from '../../templates/patterns.js';
import { getCtxifyVersion } from '../../utils/version.js';

export function registerPatternsCommand(program: Command): void {
  program
    .command('patterns <repo>')
    .description('Scaffold patterns.md for a repo with TODO placeholders')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .option('--force', 'Overwrite existing patterns.md')
    .action(async (repo: string, options: { dir?: string; force?: boolean }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run "ctxify init" first.' }));
        process.exit(1);
      }

      const config = loadConfig(configPath);
      const outputDir = config.options.outputDir || '.ctxify';

      // Validate repo exists
      const repoEntry = config.repos.find((r) => r.name === repo);
      if (!repoEntry) {
        console.log(
          JSON.stringify({
            error: `Repo "${repo}" not found in ctx.yaml. Available repos: ${config.repos.map((r) => r.name).join(', ')}`,
          }),
        );
        process.exit(1);
      }

      const repoDir = resolveRepoCtxDir(workspaceRoot, repoEntry, config.mode, outputDir);
      const patternsPath = join(repoDir, 'patterns.md');
      const fileExisted = existsSync(patternsPath);

      if (fileExisted && !options.force) {
        console.log(
          JSON.stringify({
            error: `patterns.md already exists for repo "${repo}". Use --force to overwrite.`,
          }),
        );
        process.exit(1);
      }

      mkdirSync(repoDir, { recursive: true });
      const content = generatePatternsTemplate({ repo, ctxifyVersion: getCtxifyVersion() });
      writeFileSync(patternsPath, content, 'utf-8');

      const result = {
        status: 'scaffolded',
        repo,
        path: patternsPath,
        file_existed: fileExisted,
      };

      console.log(JSON.stringify(result, null, 2));
    });
}
