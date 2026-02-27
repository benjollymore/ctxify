import type { Command } from 'commander';
import { resolve, join, basename, relative } from 'node:path';
import { existsSync, writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { generateDefaultConfig, serializeConfig } from '../../core/config.js';
import type { RepoEntry, OperatingMode, MonoRepoOptions } from '../../core/config.js';
import { parseRepoManifest } from '../../core/manifest.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import { autoDetectMode } from '../../core/detect.js';
import { findGitRoots } from '../../utils/git.js';
import type { RepoTemplateData } from '../../templates/index-md.js';

import { generateIndexTemplate } from '../../templates/index-md.js';
import { generateRepoTemplate } from '../../templates/repo.js';
import { installSkill, AGENT_CONFIGS } from '../install-skill.js';
import { runInteractiveFlow } from './init-interactive.js';

export type AgentType = 'claude' | 'copilot' | 'cursor' | 'codex';

export interface ScaffoldOptions {
  workspaceRoot: string;
  mode: OperatingMode;
  repos: RepoEntry[];
  monoRepoOptions?: MonoRepoOptions;
  force?: boolean;
  agents?: AgentType[];
}

export interface ScaffoldResult {
  status: 'initialized';
  mode: OperatingMode;
  config: string;
  repos: string[];
  shards_written: boolean;
  skills_installed?: string[];
}

export async function scaffoldWorkspace(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { workspaceRoot, mode, repos, monoRepoOptions } = options;
  const configPath = join(workspaceRoot, 'ctx.yaml');

  // Generate and write ctx.yaml
  const config = generateDefaultConfig(workspaceRoot, repos, mode, monoRepoOptions);
  writeFileSync(configPath, serializeConfig(config), 'utf-8');

  // Parse manifests for each repo
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

  // Generate all templates and write to .ctxify/
  const outputRoot = join(workspaceRoot, outputDir);
  mkdirSync(outputRoot, { recursive: true });

  // index.md
  writeFileSync(
    join(outputRoot, 'index.md'),
    generateIndexTemplate(repoTemplateDataList, workspaceRoot, mode),
    'utf-8',
  );

  // Per-repo overview files: repos/{name}/overview.md
  for (const repo of repoTemplateDataList) {
    const repoDir = join(outputRoot, 'repos', repo.name);
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'overview.md'), generateRepoTemplate(repo), 'utf-8');
  }

  // Ensure .ctxify/ is in .gitignore
  ensureGitignore(workspaceRoot, outputDir);

  // Install skills for each specified agent
  const skills_installed: string[] = [];
  if (options.agents) {
    for (const agent of options.agents) {
      const dest = installSkill(workspaceRoot, agent);
      skills_installed.push(dest);
    }
  }

  return {
    status: 'initialized',
    mode,
    config: configPath,
    repos: repos.map((r) => r.name),
    shards_written: true,
    ...(skills_installed.length > 0 ? { skills_installed } : {}),
  };
}

export function registerInitCommand(program: Command): void {
  program
    .command('init [dir]')
    .description('Scaffold ctx.yaml and .ctxify/ context shards')
    .option('--repos <paths...>', 'Multi-repo: specify repo subdirectories')
    .option('--mono', 'Mono-repo: detect packages from workspace config')
    .option(
      '--agent <agents...>',
      'Install playbook for specified agents (claude, copilot, cursor, codex)',
    )
    .option('-f, --force', 'Overwrite existing ctx.yaml and .ctxify/')
    .action(
      async (
        dir?: string,
        options?: { repos?: string[]; mono?: boolean; agent?: string[]; force?: boolean },
      ) => {
        const workspaceRoot = resolve(dir || '.');
        const configPath = join(workspaceRoot, 'ctx.yaml');

        // 1. If ctx.yaml exists and --force not set -> error + exit
        if (existsSync(configPath) && !options?.force) {
          console.log(
            JSON.stringify({
              error: `ctx.yaml already exists in ${workspaceRoot}. Use --force to overwrite.`,
            }),
          );
          process.exit(1);
        }

        // 2. Interactive vs flag-driven path
        const hasFlags = (options?.repos && options.repos.length > 0) || options?.mono;
        const isInteractive = !hasFlags && process.stdin.isTTY;

        let scaffoldOptions: ScaffoldOptions;

        if (isInteractive) {
          scaffoldOptions = await runInteractiveFlow(workspaceRoot);
        } else {
          // Flag-driven path
          let mode: OperatingMode;
          let repos: RepoEntry[];
          let monoRepoOptions: MonoRepoOptions | undefined;

          if (options?.repos && options.repos.length > 0) {
            mode = 'multi-repo';
            repos = options.repos.map((repoPath) => {
              const absPath = resolve(workspaceRoot, repoPath);
              const name = basename(absPath);
              const relPath = relative(workspaceRoot, absPath) || '.';
              return { path: relPath, name };
            });
          } else if (options?.mono) {
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
              repos = buildMultiRepoEntries(workspaceRoot);
            }
          }

          let agents: AgentType[] | undefined;
          if (options?.agent) {
            const validAgents = Object.keys(AGENT_CONFIGS);
            for (const name of options.agent) {
              if (!validAgents.includes(name)) {
                console.log(
                  JSON.stringify({
                    error: `Unknown agent "${name}". Valid agents: ${validAgents.join(', ')}`,
                  }),
                );
                process.exit(1);
              }
            }
            agents = options.agent as AgentType[];
          }
          scaffoldOptions = {
            workspaceRoot,
            mode,
            repos,
            monoRepoOptions,
            force: options?.force,
            agents,
          };
        }

        // 3. Scaffold workspace
        const result = await scaffoldWorkspace(scaffoldOptions);

        // 4. Output JSON summary
        console.log(JSON.stringify(result, null, 2));

        // 5. Next step hint (stderr so it doesn't pollute JSON output)
        if (result.skills_installed && result.skills_installed.length > 0) {
          // Derive hints from installed destination paths
          const hints = Object.values(AGENT_CONFIGS)
            .filter((c) => result.skills_installed!.includes(c.destPath))
            .map((c) => c.nextStepHint);
          if (hints.length > 0) {
            console.error(
              `\n✓ Context scaffolded. Next steps:\n${hints.map((h) => `  • ${h}`).join('\n')}`,
            );
          } else {
            console.error('\n✓ Context scaffolded.');
          }
        } else {
          console.error('\n✓ Context scaffolded.');
        }
      },
    );
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

export function buildMultiRepoEntries(workspaceRoot: string): RepoEntry[] {
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
