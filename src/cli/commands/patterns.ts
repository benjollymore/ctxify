import type { Command } from 'commander';
import { join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { resolveRepoCtxDir, resolveWorkspaceRootOrThrow } from '../../core/paths.js';
import { ConfigError } from '../../core/errors.js';
import { generatePatternsTemplate } from '../../templates/patterns.js';
import { getCtxifyVersion } from '../../utils/version.js';

export function registerPatternsCommand(program: Command): void {
  program
    .command('patterns <repo>')
    .description('Scaffold patterns.md for a repo with TODO placeholders')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .option('--force', 'Overwrite existing patterns.md')
    .action(async (repo: string, options: { dir?: string; force?: boolean }) => {
      let workspaceRoot: string;
      try {
        const resolved = resolveWorkspaceRootOrThrow(options.dir);
        workspaceRoot = resolved.root;
        if (resolved.fromParent) {
          console.error(`Warning: Running from sub-repo. Using workspace root at ${resolved.root}.`);
        }
      } catch (e) {
        if (e instanceof ConfigError) {
          console.log(JSON.stringify({ error: e.message }));
          process.exit(1);
        }
        throw e;
      }
      const configPath = join(workspaceRoot, 'ctx.yaml');

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
