import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { collectMdFiles } from '../../core/validate.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('JSON status report for workspace context shards')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { dir?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');

      const configPath = join(workspaceRoot, 'ctx.yaml');
      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run "ctxify init" first.', has_config: false }));
        return;
      }

      const config = loadConfig(configPath);
      const outputDir = config.options.outputDir || '.ctxify';
      const outputRoot = join(workspaceRoot, outputDir);

      const indexExists = existsSync(join(outputRoot, 'index.md'));

      // Check which shard directories exist
      const shardDirs = ['repos'];
      const shards = shardDirs.filter((dir) => existsSync(join(outputRoot, dir)));

      // Count <!-- TODO: markers across all .md files
      let todoCount = 0;
      if (existsSync(outputRoot)) {
        const mdFiles = collectMdFiles(outputRoot);
        for (const filePath of mdFiles) {
          const content = readFileSync(filePath, 'utf-8');
          const matches = content.match(/<!--\s*TODO:/g);
          if (matches) todoCount += matches.length;
        }
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
