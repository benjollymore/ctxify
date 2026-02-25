import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import { loadConfig } from '../../core/config.js';
import { createWorkspaceContext } from '../../core/context.js';
import { createLogger } from '../../core/logger.js';
import { PassRegistry } from '../../core/pass-registry.js';
import { runPipeline } from '../../core/pipeline.js';
import { loadCache } from '../../core/cache.js';
import { computeStaleness } from '../../core/differ.js';
import { repoDetectionPass } from '../../passes/01-repo-detection.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show which context files are stale vs current')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { dir?: string }) => {
      const logger = createLogger('info');
      const workspaceRoot = resolve(options.dir || '.');

      const configPath = join(workspaceRoot, 'ctx.yaml');
      if (!existsSync(configPath)) {
        logger.error(`No ctx.yaml found in ${workspaceRoot}. Run "ctxify init" first.`);
        process.exit(1);
      }

      const config = loadConfig(configPath);
      const outputDir = config.options.outputDir || '.ctx';
      const ctx = createWorkspaceContext(config, workspaceRoot);

      // Run repo detection
      const registry = new PassRegistry();
      registry.register(repoDetectionPass);
      await runPipeline(ctx, registry, logger);

      // Load cache and compute staleness
      const cache = loadCache(workspaceRoot, outputDir);
      const staleness = await computeStaleness(ctx, cache);

      // Check which output files exist
      const outputFiles = [
        'AGENTS.md',
        join(outputDir, 'topology.yaml'),
        join(outputDir, 'api-contracts.md'),
        join(outputDir, 'shared-types.md'),
        join(outputDir, 'env-vars.md'),
        join(outputDir, 'db-schema.md'),
        join(outputDir, 'questions.md'),
      ];

      console.log('');
      console.log(chalk.bold('ctxify status'));
      console.log('');

      // Repo status
      console.log(chalk.bold('Repositories:'));
      for (const repo of ctx.repos) {
        const isStale = staleness.staleRepos.includes(repo.name);
        const icon = isStale ? chalk.yellow('~') : chalk.green('✓');
        const label = isStale ? chalk.yellow('stale') : chalk.green('fresh');
        console.log(`  ${icon} ${repo.name} [${label}]`);
      }
      console.log('');

      // Output files status
      console.log(chalk.bold('Output files:'));
      for (const file of outputFiles) {
        const fullPath = join(workspaceRoot, file);
        const fileExists = existsSync(fullPath);
        const icon = fileExists ? chalk.green('✓') : chalk.red('✗');
        const label = fileExists ? 'exists' : 'missing';
        console.log(`  ${icon} ${file} [${label}]`);
      }

      // Per-repo summaries
      for (const repo of ctx.repos) {
        const file = join(outputDir, `repo-${repo.name}.md`);
        const fullPath = join(workspaceRoot, file);
        const fileExists = existsSync(fullPath);
        const icon = fileExists ? chalk.green('✓') : chalk.red('✗');
        const label = fileExists ? 'exists' : 'missing';
        console.log(`  ${icon} ${file} [${label}]`);
      }
      console.log('');

      // Summary
      if (staleness.isFullyFresh) {
        console.log(chalk.green('All context is up to date.'));
      } else {
        console.log(chalk.yellow(`${staleness.staleRepos.length} repo(s) need refresh. Run "ctxify refresh" or "ctxify generate".`));
      }

      if (!cache) {
        console.log(chalk.yellow('No cache found. Run "ctxify generate" for initial scan.'));
      }
    });
}
