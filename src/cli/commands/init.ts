import type { Command } from 'commander';
import { resolve, join, basename, relative } from 'node:path';
import { existsSync, writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { generateDefaultConfig, serializeConfig } from '../../core/config.js';
import type { RepoEntry, OperatingMode, MonoRepoOptions } from '../../core/config.js';
import { parseRepoManifest } from '../../core/manifest.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import { autoDetectMode } from '../prompts.js';
import { findGitRoots, getHeadSha } from '../../utils/git.js';
import { readJsonFile } from '../../utils/fs.js';
import type { RepoTemplateData } from '../../templates/index-md.js';

import { generateIndexTemplate } from '../../templates/index-md.js';
import { generateRepoTemplate } from '../../templates/repo.js';
import { generateEndpointsTemplate } from '../../templates/endpoints.js';
import { generateTypesTemplate } from '../../templates/types.js';
import { generateEnvTemplate } from '../../templates/env.js';
import { generateTopologyTemplate } from '../../templates/topology.js';
import { generateSchemasTemplate } from '../../templates/schemas.js';
import { generateQuestionsTemplate } from '../../templates/questions.js';
import { generateAnalysisChecklist } from '../../templates/analysis.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init [dir]')
    .description('Scaffold ctx.yaml and .ctxify/ context shards')
    .option('--repos <paths...>', 'Multi-repo: specify repo subdirectories')
    .option('--mono', 'Mono-repo: detect packages from workspace config')
    .option('-f, --force', 'Overwrite existing ctx.yaml and .ctxify/')
    .action(async (dir?: string, options?: { repos?: string[]; mono?: boolean; force?: boolean }) => {
      const workspaceRoot = resolve(dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      // 1. If ctx.yaml exists and --force not set -> error + exit
      if (existsSync(configPath) && !options?.force) {
        console.log(JSON.stringify({ error: `ctx.yaml already exists in ${workspaceRoot}. Use --force to overwrite.` }));
        process.exit(1);
      }

      // 2. Determine mode
      let mode: OperatingMode;
      let repos: RepoEntry[];
      let monoRepoOptions: MonoRepoOptions | undefined;

      if (options?.repos && options.repos.length > 0) {
        // --repos -> multi-repo
        mode = 'multi-repo';
        repos = options.repos.map((repoPath) => {
          const absPath = resolve(workspaceRoot, repoPath);
          const name = basename(absPath);
          const relPath = relative(workspaceRoot, absPath) || '.';
          return { path: relPath, name };
        });
      } else if (options?.mono) {
        // --mono -> mono-repo
        mode = 'mono-repo';
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
      } else {
        // Auto-detect
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
          repos = [{ path: '.', name }];
        } else {
          // multi-repo: find git roots
          repos = buildMultiRepoEntries(workspaceRoot);
        }
      }

      // 3. Generate and write ctx.yaml
      const config = generateDefaultConfig(workspaceRoot, repos, mode, monoRepoOptions);
      writeFileSync(configPath, serializeConfig(config), 'utf-8');

      // 4. For each repo: parseRepoManifest
      const outputDir = config.options.outputDir || '.ctxify';
      const repoTemplateDataList: RepoTemplateData[] = repos.map((entry) => {
        const repoAbsPath = resolve(workspaceRoot, entry.path);
        const manifest = parseRepoManifest(repoAbsPath);
        return {
          name: entry.name,
          path: entry.path,
          ...manifest,
        };
      });

      // 5. Get git SHAs (best-effort)
      const shas: Record<string, string> = {};
      for (const entry of repos) {
        try {
          const repoAbsPath = resolve(workspaceRoot, entry.path);
          shas[entry.name] = await getHeadSha(repoAbsPath);
        } catch {
          // Not all repos may have git
        }
      }

      // 6. Generate all templates and write to .ctxify/
      const outputRoot = join(workspaceRoot, outputDir);
      mkdirSync(outputRoot, { recursive: true });
      mkdirSync(join(outputRoot, 'repos'), { recursive: true });
      mkdirSync(join(outputRoot, 'endpoints'), { recursive: true });
      mkdirSync(join(outputRoot, 'types'), { recursive: true });
      mkdirSync(join(outputRoot, 'env'), { recursive: true });
      mkdirSync(join(outputRoot, 'topology'), { recursive: true });
      mkdirSync(join(outputRoot, 'schemas'), { recursive: true });
      mkdirSync(join(outputRoot, 'questions'), { recursive: true });

      // index.md
      writeFileSync(
        join(outputRoot, 'index.md'),
        generateIndexTemplate(repoTemplateDataList, workspaceRoot, mode),
        'utf-8',
      );

      // Per-repo shards
      for (const repo of repoTemplateDataList) {
        writeFileSync(
          join(outputRoot, 'repos', `${repo.name}.md`),
          generateRepoTemplate(repo),
          'utf-8',
        );
        writeFileSync(
          join(outputRoot, 'endpoints', `${repo.name}.md`),
          generateEndpointsTemplate(repo.name),
          'utf-8',
        );
        writeFileSync(
          join(outputRoot, 'schemas', `${repo.name}.md`),
          generateSchemasTemplate(repo.name),
          'utf-8',
        );
      }

      // Single-file shards
      writeFileSync(
        join(outputRoot, 'types', 'shared.md'),
        generateTypesTemplate(mode),
        'utf-8',
      );
      writeFileSync(
        join(outputRoot, 'env', 'all.md'),
        generateEnvTemplate(),
        'utf-8',
      );
      writeFileSync(
        join(outputRoot, 'topology', 'graph.md'),
        generateTopologyTemplate(repoTemplateDataList),
        'utf-8',
      );
      writeFileSync(
        join(outputRoot, 'questions', 'pending.md'),
        generateQuestionsTemplate(),
        'utf-8',
      );
      writeFileSync(
        join(outputRoot, '_analysis.md'),
        generateAnalysisChecklist(repoTemplateDataList),
        'utf-8',
      );

      // 7. Ensure .ctxify/ is in .gitignore
      ensureGitignore(workspaceRoot, outputDir);

      // 8. Output JSON summary
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

function ensureGitignore(workspaceRoot: string, outputDir: string): void {
  const gitignorePath = join(workspaceRoot, '.gitignore');
  const entry = outputDir.endsWith('/') ? outputDir : outputDir + '/';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    // Check if outputDir is already covered (with or without trailing slash)
    const lines = content.split('\n').map((l) => l.trim());
    if (lines.includes(entry) || lines.includes(outputDir)) return;
    const suffix = content.endsWith('\n') ? '' : '\n';
    appendFileSync(gitignorePath, `${suffix}${entry}\n`, 'utf-8');
  } else {
    writeFileSync(gitignorePath, `${entry}\n`, 'utf-8');
  }
}

function buildMultiRepoEntries(workspaceRoot: string): RepoEntry[] {
  const gitRoots = findGitRoots(workspaceRoot, 3);
  const workspaceAbs = resolve(workspaceRoot);
  const subRepos = gitRoots.filter((root) => resolve(root) !== workspaceAbs);
  const repoRoots = subRepos.length > 0 ? subRepos : gitRoots;

  return repoRoots.map((root) => {
    const name = basename(root);
    const relPath = relative(workspaceRoot, root) || '.';
    return { path: relPath, name };
  });
}
