import type { Command } from 'commander';
import { resolve, join, basename, relative } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { generateDefaultConfig, serializeConfig } from '../../core/config.js';
import type { RepoEntry, OperatingMode, MonoRepoOptions, Relationship } from '../../core/config.js';
import { createWorkspaceContext } from '../../core/context.js';
import { createLogger } from '../../core/logger.js';
import { PassRegistry } from '../../core/pass-registry.js';
import { runPipelineParallel } from '../../core/pipeline.js';
import { saveCache, createCacheStore } from '../../core/cache.js';
import { buildCacheEntry } from '../../core/differ.js';
import { findGitRoots } from '../../utils/git.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import { readJsonFile } from '../../utils/fs.js';
import { writeShards } from '../../core/shard-writer.js';
import { runInteractiveInterview, autoDetectMode } from '../prompts.js';

import { repoDetectionPass } from '../../passes/01-repo-detection.js';
import { manifestParsingPass } from '../../passes/02-manifest-parsing.js';
import { structureMappingPass } from '../../passes/03-structure-mapping.js';
import { apiDiscoveryPass } from '../../passes/04-api-discovery.js';
import { typeExtractionPass } from '../../passes/05-type-extraction.js';
import { envScanningPass } from '../../passes/06-env-scanning.js';
import { relationshipInferencePass } from '../../passes/07-relationship-inference.js';
import { conventionDetectionPass } from '../../passes/08-convention-detection.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init [dir]')
    .description('Auto-detect repos, create ctx.yaml, run first scan')
    .option('-f, --force', 'Overwrite existing ctx.yaml')
    .option('-i, --interactive', 'Guided interview for multi-repo setup')
    .action(async (dir?: string, options?: { force?: boolean; interactive?: boolean }) => {
      const logger = createLogger('error');
      const workspaceRoot = resolve(dir || '.');

      const configPath = join(workspaceRoot, 'ctx.yaml');
      if (existsSync(configPath) && !options?.force) {
        console.log(JSON.stringify({ error: `ctx.yaml already exists in ${workspaceRoot}. Use --force to overwrite.` }));
        process.exit(1);
      }

      let mode: OperatingMode;
      let repos: RepoEntry[];
      let monoRepoOptions: MonoRepoOptions | undefined;
      let relationships: Relationship[] = [];

      if (options?.interactive) {
        // Guided interview for multi-repo setup
        const result = await runInteractiveInterview(workspaceRoot);
        mode = result.mode;
        repos = result.repos;
        relationships = result.relationships;
        monoRepoOptions = result.monoRepoOptions;
      } else {
        // Silent auto-detect (default — no prompts)
        const detection = autoDetectMode(workspaceRoot);
        mode = detection.mode;

        if (mode === 'mono-repo') {
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
        } else if (mode === 'single-repo') {
          const name = basename(workspaceRoot);
          const entry: RepoEntry = { path: '.', name };
          const pkg = readJsonFile<{ description?: string }>(join(workspaceRoot, 'package.json'));
          if (pkg) {
            entry.language = 'typescript';
            entry.description = pkg.description;
          }
          repos = [entry];
        } else {
          // multi-repo: existing behavior
          repos = buildMultiRepoEntries(workspaceRoot);
        }
      }

      // Generate and write config
      const config = generateDefaultConfig(workspaceRoot, repos, mode, monoRepoOptions, relationships);
      writeFileSync(configPath, serializeConfig(config), 'utf-8');

      // Run full pipeline
      const ctx = createWorkspaceContext(config, workspaceRoot);
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
      const outputDir = config.options.outputDir || '.ctx';
      writeShards(ctx, workspaceRoot, outputDir);

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

      // JSON output
      const summary = {
        status: 'initialized',
        mode,
        config: configPath,
        repos: repos.map((r) => r.name),
        shards_written: true,
      };
      console.log(JSON.stringify(summary, null, 2));
    });
}

function buildMultiRepoEntries(workspaceRoot: string): RepoEntry[] {
  const gitRoots = findGitRoots(workspaceRoot, 3);
  const workspaceAbs = resolve(workspaceRoot);
  const subRepos = gitRoots.filter((root) => resolve(root) !== workspaceAbs);
  const repoRoots = subRepos.length > 0 ? subRepos : gitRoots;

  return repoRoots.map((root) => {
    const name = basename(root);
    const relPath = relative(workspaceRoot, root) || '.';
    const entry: RepoEntry = { path: relPath, name };

    const pkg = readJsonFile<{ description?: string; dependencies?: Record<string, string> }>(join(root, 'package.json'));
    if (pkg) {
      entry.language = 'typescript';
      entry.description = pkg.description;
    }

    return entry;
  });
}
