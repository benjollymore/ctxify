import type { Command } from 'commander';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { resolveRepoCtxDir, resolveWorkspaceRootOrThrow } from '../../core/paths.js';
import { ConfigError } from '../../core/errors.js';
import { collectMdFiles } from '../../core/validate.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('JSON status report for workspace context shards')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { dir?: string }) => {
      let workspaceRoot: string;
      try {
        const resolved = resolveWorkspaceRootOrThrow(options.dir);
        workspaceRoot = resolved.root;
        if (resolved.fromParent) {
          console.error(`Warning: Running from sub-repo. Using workspace root at ${resolved.root}.`);
        }
      } catch (e) {
        if (e instanceof ConfigError) {
          console.log(
            JSON.stringify({
              error: e.message,
              has_config: false,
            }),
          );
          return;
        }
        throw e;
      }
      const configPath = join(workspaceRoot, 'ctx.yaml');

      const config = loadConfig(configPath);
      const outputDir = config.options.outputDir || '.ctxify';
      const outputRoot = join(workspaceRoot, outputDir);

      const indexExists = existsSync(join(outputRoot, 'index.md'));

      // Check which shard directories exist
      const shardDirs = ['repos'];
      const shards = shardDirs.filter((dir) => existsSync(join(outputRoot, dir)));

      // Count <!-- TODO: markers across all .md files
      let todoCount = 0;
      const allMdFiles: string[] = [];
      if (existsSync(outputRoot)) {
        allMdFiles.push(...collectMdFiles(outputRoot));
      }
      // Multi-repo: also collect from per-repo .ctxify/ directories
      if (config.mode === 'multi-repo') {
        for (const repo of config.repos) {
          const repoCtxDir = resolveRepoCtxDir(workspaceRoot, repo, config.mode, outputDir);
          if (existsSync(repoCtxDir)) {
            allMdFiles.push(...collectMdFiles(repoCtxDir));
          }
        }
      }
      for (const filePath of allMdFiles) {
        const content = readFileSync(filePath, 'utf-8');
        const matches = content.match(/<!--\s*TODO:/g);
        if (matches) todoCount += matches.length;
      }

      const result = {
        index_exists: indexExists,
        repos: config.repos.map((r) => r.name),
        shards,
        todo_count: todoCount,
        has_config: true,
      };

      console.log(JSON.stringify(result, null, 2));
    });
}
