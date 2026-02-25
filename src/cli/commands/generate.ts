import type { Command } from 'commander';
import { resolve, join, dirname } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { createWorkspaceContext } from '../../core/context.js';
import { createLogger } from '../../core/logger.js';
import { PassRegistry } from '../../core/pass-registry.js';
import { runPipeline } from '../../core/pipeline.js';
import { saveCache, createCacheStore } from '../../core/cache.js';
import { buildCacheEntry } from '../../core/differ.js';
import { readFileIfExists } from '../../utils/fs.js';
import { parseYaml } from '../../utils/yaml.js';
import type { Renderer } from '../../renderers/types.js';

// Passes
import { repoDetectionPass } from '../../passes/01-repo-detection.js';
import { manifestParsingPass } from '../../passes/02-manifest-parsing.js';
import { structureMappingPass } from '../../passes/03-structure-mapping.js';
import { apiDiscoveryPass } from '../../passes/04-api-discovery.js';
import { typeExtractionPass } from '../../passes/05-type-extraction.js';
import { envScanningPass } from '../../passes/06-env-scanning.js';
import { relationshipInferencePass } from '../../passes/07-relationship-inference.js';
import { conventionDetectionPass } from '../../passes/08-convention-detection.js';

// Renderers
import { agentsMdRenderer } from '../../renderers/agents-md.js';
import { topologyYamlRenderer } from '../../renderers/topology-yaml.js';
import { apiContractsMdRenderer } from '../../renderers/api-contracts-md.js';
import { sharedTypesMdRenderer } from '../../renderers/shared-types-md.js';
import { createRepoSummaryRenderers } from '../../renderers/repo-summary-md.js';
import { envVarsMdRenderer } from '../../renderers/env-vars-md.js';
import { dbSchemaMdRenderer } from '../../renderers/db-schema-md.js';
import { questionsMdRenderer } from '../../renderers/questions-md.js';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Full analysis pipeline -> write all output files')
    .option('--with-answers', 'Incorporate answers from .ctx/answers.yaml')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .option('-q, --quiet', 'Suppress info output')
    .action(async (options: { withAnswers?: boolean; dir?: string; quiet?: boolean }) => {
      const logger = createLogger(options.quiet ? 'warn' : 'info');
      const workspaceRoot = resolve(options.dir || '.');

      // Load config
      const configPath = join(workspaceRoot, 'ctx.yaml');
      if (!existsSync(configPath)) {
        logger.error(`No ctx.yaml found in ${workspaceRoot}. Run "ctxify init" first.`);
        process.exit(1);
      }

      const config = loadConfig(configPath);
      const ctx = createWorkspaceContext(config, workspaceRoot);

      // Load answers if requested
      if (options.withAnswers) {
        const answersPath = join(workspaceRoot, config.options.outputDir || '.ctx', 'answers.yaml');
        const answersContent = readFileIfExists(answersPath);
        if (answersContent) {
          ctx.answers = parseYaml<Record<string, string>>(answersContent) || {};
          logger.info(`Loaded ${Object.keys(ctx.answers).length} answers`);
        }
      }

      // Register passes
      const registry = new PassRegistry();
      registry.register(repoDetectionPass);
      registry.register(manifestParsingPass);
      registry.register(structureMappingPass);
      registry.register(apiDiscoveryPass);
      registry.register(typeExtractionPass);
      registry.register(envScanningPass);
      registry.register(relationshipInferencePass);
      registry.register(conventionDetectionPass);

      // Run pipeline
      await runPipeline(ctx, registry, logger);

      // Collect renderers
      const renderers: Renderer[] = [
        agentsMdRenderer,
        topologyYamlRenderer,
        apiContractsMdRenderer,
        sharedTypesMdRenderer,
        envVarsMdRenderer,
        dbSchemaMdRenderer,
      ];

      // Add per-repo summary renderers
      renderers.push(...createRepoSummaryRenderers(ctx));

      // Add questions renderer if there are questions
      if (ctx.questions.length > 0) {
        renderers.push(questionsMdRenderer);
      }

      // Write output files
      const outputDir = config.options.outputDir || '.ctx';
      for (const renderer of renderers) {
        const outputPath = renderer.outputPath.startsWith('.ctx/')
          ? join(workspaceRoot, outputDir, renderer.outputPath.slice(5))
          : join(workspaceRoot, renderer.outputPath);

        mkdirSync(dirname(outputPath), { recursive: true });
        const content = renderer.render(ctx);
        writeFileSync(outputPath, content, 'utf-8');
        logger.debug(`Wrote ${renderer.outputPath}`);
      }

      // Save cache
      const cache = createCacheStore();
      for (const repo of ctx.repos) {
        try {
          cache.repos[repo.name] = await buildCacheEntry(repo.path);
        } catch {
          // Skip cache for repos without git
        }
      }
      saveCache(workspaceRoot, outputDir, cache);

      logger.info(`Generated ${renderers.length} context files in ${workspaceRoot}`);

      if (ctx.questions.length > 0) {
        logger.warn(`${ctx.questions.length} questions need clarification — see .ctx/questions.md`);
      }
    });
}
