import type { Command } from 'commander';
import { resolve, join, basename, relative } from 'node:path';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { loadConfig, generateDefaultConfig, serializeConfig } from '../../core/config.js';
import type { RepoEntry, OperatingMode, MonoRepoOptions } from '../../core/config.js';
import { createWorkspaceContext } from '../../core/context.js';
import { createLogger } from '../../core/logger.js';
import { PassRegistry } from '../../core/pass-registry.js';
import { runPipelineParallel } from '../../core/pipeline.js';
import { loadCache, saveCache, createCacheStore } from '../../core/cache.js';
import { computeStaleness, buildCacheEntry } from '../../core/differ.js';
import { readFileIfExists, readJsonFile } from '../../utils/fs.js';
import { parseYaml } from '../../utils/yaml.js';
import { findGitRoots } from '../../utils/git.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import { autoDetectMode } from '../prompts.js';
import { writeShards } from '../../core/shard-writer.js';

import { repoDetectionPass } from '../../passes/01-repo-detection.js';
import { manifestParsingPass } from '../../passes/02-manifest-parsing.js';
import { structureMappingPass } from '../../passes/03-structure-mapping.js';
import { apiDiscoveryPass } from '../../passes/04-api-discovery.js';
import { typeExtractionPass } from '../../passes/05-type-extraction.js';
import { envScanningPass } from '../../passes/06-env-scanning.js';
import { relationshipInferencePass } from '../../passes/07-relationship-inference.js';
import { conventionDetectionPass } from '../../passes/08-convention-detection.js';

function autoInit(workspaceRoot: string): void {
  const configPath = join(workspaceRoot, 'ctx.yaml');

  // Auto-detect mode
  const detection = autoDetectMode(workspaceRoot);
  const mode: OperatingMode = detection.mode;
  let repos: RepoEntry[];
  let monoRepoOptions: MonoRepoOptions | undefined;

  switch (mode) {
    case 'mono-repo': {
      const monoDetection = detectMonoRepo(workspaceRoot);
      monoRepoOptions = {
        manager: monoDetection.manager || undefined,
        packageGlobs: monoDetection.packageGlobs,
      };
      repos = monoDetection.packages.map((pkg) => ({
        path: pkg.relativePath,
        name: pkg.name,
        language: pkg.language,
        description: pkg.description,
      }));
      break;
    }

    case 'single-repo': {
      const name = basename(workspaceRoot);
      const entry: RepoEntry = { path: '.', name };
      const pkg = readJsonFile<{ description?: string }>(join(workspaceRoot, 'package.json'));
      if (pkg) {
        entry.language = 'typescript';
        entry.description = pkg.description;
      }
      repos = [entry];
      break;
    }

    case 'multi-repo':
    default: {
      const gitRoots = findGitRoots(workspaceRoot, 3);
      const workspaceAbs = resolve(workspaceRoot);
      const subRepos = gitRoots.filter((root) => resolve(root) !== workspaceAbs);
      const repoRoots = subRepos.length > 0 ? subRepos : gitRoots;

      repos = repoRoots.map((root) => {
        const name = basename(root);
        const relPath = relative(workspaceRoot, root) || '.';
        const entry: RepoEntry = { path: relPath, name };

        const pkg = readJsonFile<{ description?: string }>(join(root, 'package.json'));
        if (pkg) {
          entry.language = 'typescript';
          entry.description = pkg.description;
        }

        return entry;
      });
      break;
    }
  }

  const config = generateDefaultConfig(workspaceRoot, repos, mode, monoRepoOptions);
  writeFileSync(configPath, serializeConfig(config), 'utf-8');
}

export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Scan workspace, write sharded context to .ctx/, output index as JSON')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .option('--force', 'Re-scan even if all repos are fresh')
    .option('--with-answers', 'Incorporate answers from .ctx/answers.yaml')
    .action(async (options: { dir?: string; force?: boolean; withAnswers?: boolean }) => {
      const logger = createLogger('error');
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      // Auto-init if no ctx.yaml
      if (!existsSync(configPath)) {
        autoInit(workspaceRoot);
      }

      const config = loadConfig(configPath);
      const outputDir = config.options.outputDir || '.ctx';

      // Run repo detection for staleness check
      const detectionCtx = createWorkspaceContext(config, workspaceRoot);
      const detectionRegistry = new PassRegistry();
      detectionRegistry.register(repoDetectionPass);
      await runPipelineParallel(detectionCtx, detectionRegistry, logger);

      // Compute staleness
      const cache = loadCache(workspaceRoot, outputDir);
      const staleness = await computeStaleness(detectionCtx, cache);

      // Check if index.yaml exists
      const indexPath = join(workspaceRoot, outputDir, 'index.yaml');
      const outputsExist = existsSync(indexPath);

      if (staleness.isFullyFresh && outputsExist && !options.force) {
        // Read and output existing index as JSON
        const indexContent = readFileSync(indexPath, 'utf-8');
        const indexData = parseYaml<Record<string, unknown>>(indexContent);
        console.log(JSON.stringify({ status: 'fresh', ...indexData }, null, 2));
        return;
      }

      // Run full pipeline
      const ctx = createWorkspaceContext(config, workspaceRoot);

      if (options.withAnswers) {
        const answersPath = join(workspaceRoot, outputDir, 'answers.yaml');
        const answersContent = readFileIfExists(answersPath);
        if (answersContent) {
          ctx.answers = parseYaml<Record<string, string>>(answersContent) || {};
        }
      }

      const registry = new PassRegistry();
      registry.register(repoDetectionPass);
      registry.register(manifestParsingPass);
      registry.register(structureMappingPass);
      registry.register(apiDiscoveryPass);
      registry.register(typeExtractionPass);
      registry.register(envScanningPass);
      registry.register(relationshipInferencePass);
      registry.register(conventionDetectionPass);

      await runPipelineParallel(ctx, registry, logger);

      // Write shards
      writeShards(ctx, workspaceRoot, outputDir);

      // Save cache
      const newCache = createCacheStore();
      for (const repo of ctx.repos) {
        try {
          newCache.repos[repo.name] = await buildCacheEntry(repo.path);
        } catch {
          // Skip cache for repos without git
        }
      }
      saveCache(workspaceRoot, outputDir, newCache);

      // Output index as JSON
      const indexContent = readFileSync(join(workspaceRoot, outputDir, 'index.yaml'), 'utf-8');
      const indexData = parseYaml<Record<string, unknown>>(indexContent);
      console.log(JSON.stringify({ status: 'generated', ...indexData }, null, 2));
    });
}
