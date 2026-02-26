import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { createWorkspaceContext } from '../../core/context.js';
import { createLogger } from '../../core/logger.js';
import { PassRegistry } from '../../core/pass-registry.js';
import { runPipelineParallel } from '../../core/pipeline.js';
import { loadCache } from '../../core/cache.js';
import { computeStaleness } from '../../core/differ.js';
import { repoDetectionPass } from '../../passes/01-repo-detection.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('JSON staleness report for workspace context')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { dir?: string }) => {
      const logger = createLogger('error');
      const workspaceRoot = resolve(options.dir || '.');

      const configPath = join(workspaceRoot, 'ctx.yaml');
      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run "ctxify init" or "ctxify scan" first.', has_cache: false }));
        return;
      }

      const config = loadConfig(configPath);
      const outputDir = config.options.outputDir || '.ctxify';
      const ctx = createWorkspaceContext(config, workspaceRoot);

      // Run repo detection
      const registry = new PassRegistry();
      registry.register(repoDetectionPass);
      await runPipelineParallel(ctx, registry, logger);

      // Load cache and compute staleness
      const cache = loadCache(workspaceRoot, outputDir);
      const staleness = await computeStaleness(ctx, cache);

      // Check shard directory structure
      const shardDirs = ['repos', 'endpoints', 'types', 'env', 'topology', 'schemas', 'questions'];
      const shardStatus = shardDirs.map((dir) => ({
        shard: dir,
        exists: existsSync(join(workspaceRoot, outputDir, dir)),
      }));

      const indexExists = existsSync(join(workspaceRoot, outputDir, 'index.yaml'));

      const result = {
        stale: staleness.staleRepos,
        fresh: staleness.freshRepos,
        is_fully_fresh: staleness.isFullyFresh,
        has_cache: cache !== null,
        index_exists: indexExists,
        repos: ctx.repos.map((r) => ({
          name: r.name,
          stale: staleness.staleRepos.includes(r.name),
        })),
        shards: shardStatus,
      };

      console.log(JSON.stringify(result, null, 2));
    });
}
