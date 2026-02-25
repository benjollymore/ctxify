import type { Command } from 'commander';
import { resolve, join, dirname } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { createWorkspaceContext } from '../../core/context.js';
import { createLogger } from '../../core/logger.js';
import { PassRegistry } from '../../core/pass-registry.js';
import { runPipeline } from '../../core/pipeline.js';
import { loadCache, saveCache, createCacheStore } from '../../core/cache.js';
import { computeStaleness, buildCacheEntry } from '../../core/differ.js';
import type { Renderer } from '../../renderers/types.js';

import { repoDetectionPass } from '../../passes/01-repo-detection.js';
import { manifestParsingPass } from '../../passes/02-manifest-parsing.js';
import { structureMappingPass } from '../../passes/03-structure-mapping.js';
import { apiDiscoveryPass } from '../../passes/04-api-discovery.js';
import { typeExtractionPass } from '../../passes/05-type-extraction.js';
import { envScanningPass } from '../../passes/06-env-scanning.js';
import { relationshipInferencePass } from '../../passes/07-relationship-inference.js';
import { conventionDetectionPass } from '../../passes/08-convention-detection.js';

import { agentsMdRenderer } from '../../renderers/agents-md.js';
import { topologyYamlRenderer } from '../../renderers/topology-yaml.js';
import { apiContractsMdRenderer } from '../../renderers/api-contracts-md.js';
import { sharedTypesMdRenderer } from '../../renderers/shared-types-md.js';
import { createRepoSummaryRenderers } from '../../renderers/repo-summary-md.js';
import { envVarsMdRenderer } from '../../renderers/env-vars-md.js';
import { dbSchemaMdRenderer } from '../../renderers/db-schema-md.js';
import { questionsMdRenderer } from '../../renderers/questions-md.js';

export function registerRefreshCommand(program: Command): void {
  program
    .command('refresh')
    .description('Diff-aware incremental update (only stale files)')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .option('-q, --quiet', 'Suppress info output')
    .action(async (options: { dir?: string; quiet?: boolean }) => {
      const logger = createLogger(options.quiet ? 'warn' : 'info');
      const workspaceRoot = resolve(options.dir || '.');

      const configPath = join(workspaceRoot, 'ctx.yaml');
      if (!existsSync(configPath)) {
        logger.error(`No ctx.yaml found in ${workspaceRoot}. Run "ctxify init" first.`);
        process.exit(1);
      }

      const config = loadConfig(configPath);
      const outputDir = config.options.outputDir || '.ctx';
      const ctx = createWorkspaceContext(config, workspaceRoot);

      // Load existing cache
      const cache = loadCache(workspaceRoot, outputDir);

      // Run repo detection first to populate ctx.repos for staleness check
      const detectionRegistry = new PassRegistry();
      detectionRegistry.register(repoDetectionPass);
      await runPipeline(ctx, detectionRegistry, logger);

      // Compute staleness
      const staleness = await computeStaleness(ctx, cache);

      if (staleness.isFullyFresh) {
        logger.info('All context files are up to date. Nothing to refresh.');
        return;
      }

      logger.info(`Stale repos: ${staleness.staleRepos.join(', ')}`);
      logger.info(`Fresh repos: ${staleness.freshRepos.join(', ')}`);

      // Run full pipeline (passes operate on all repos but this still catches changes)
      const registry = new PassRegistry();
      registry.register(repoDetectionPass);
      registry.register(manifestParsingPass);
      registry.register(structureMappingPass);
      registry.register(apiDiscoveryPass);
      registry.register(typeExtractionPass);
      registry.register(envScanningPass);
      registry.register(relationshipInferencePass);
      registry.register(conventionDetectionPass);

      // Reset context for full re-run
      const freshCtx = createWorkspaceContext(config, workspaceRoot);
      await runPipeline(freshCtx, registry, logger);

      // Write all renderers
      const renderers: Renderer[] = [
        agentsMdRenderer,
        topologyYamlRenderer,
        apiContractsMdRenderer,
        sharedTypesMdRenderer,
        envVarsMdRenderer,
        dbSchemaMdRenderer,
      ];
      renderers.push(...createRepoSummaryRenderers(freshCtx));
      if (freshCtx.questions.length > 0) {
        renderers.push(questionsMdRenderer);
      }

      for (const renderer of renderers) {
        const outputPath = renderer.outputPath.startsWith('.ctx/')
          ? join(workspaceRoot, outputDir, renderer.outputPath.slice(5))
          : join(workspaceRoot, renderer.outputPath);

        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, renderer.render(freshCtx), 'utf-8');
      }

      // Update cache
      const newCache = createCacheStore();
      for (const repo of freshCtx.repos) {
        try {
          newCache.repos[repo.name] = await buildCacheEntry(repo.path);
        } catch {
          // Skip cache for repos without git
        }
      }
      saveCache(workspaceRoot, outputDir, newCache);

      logger.info(`Refreshed ${renderers.length} context files`);
    });
}
