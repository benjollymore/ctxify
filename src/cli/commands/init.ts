import type { Command } from 'commander';
import { resolve, join, basename, relative } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateDefaultConfig, serializeConfig } from '../../core/config.js';
import type {
  RepoEntry,
  OperatingMode,
  MonoRepoOptions,
  SkillScope,
  SkillEntry,
} from '../../core/config.js';
import { parseRepoManifest } from '../../core/manifest.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import { autoDetectMode } from '../../core/detect.js';
import { findGitRoots } from '../../utils/git.js';
import type { RepoTemplateData } from '../../templates/index-md.js';

import { generateIndexTemplate } from '../../templates/index-md.js';
import { generateRepoTemplate } from '../../templates/repo.js';
import { generateWorkspaceTemplate } from '../../templates/workspace.js';
import { generateCorrectionsTemplate } from '../../templates/corrections.js';
import { generateRulesTemplate } from '../../templates/rules.js';
import { resolveRepoCtxDir, resolvePrimaryRepo, findWorkspaceRoot } from '../../core/paths.js';
import { installSkill, AGENT_CONFIGS } from '../install-skill.js';
import { installClaudeHook } from '../install-hooks.js';
import { runInteractiveFlow } from './init-interactive.js';
import { getCtxifyVersion } from '../../utils/version.js';

export type AgentType = 'claude' | 'copilot' | 'cursor' | 'codex';

export interface ScaffoldOptions {
  workspaceRoot: string;
  mode: OperatingMode;
  repos: RepoEntry[];
  monoRepoOptions?: MonoRepoOptions;
  primaryRepo?: string;
  force?: boolean;
  agents?: AgentType[];
  install_method?: 'global' | 'local' | 'npx';
  agentScopes?: Record<string, SkillScope>;
  homeDir?: string;
  /** Install Claude Code SessionStart hook. Defaults to true when claude agent is selected. */
  hook?: boolean;
}

export function detectInstallMethod(argv1 = process.argv[1]): 'global' | 'local' | 'npx' {
  if (argv1.includes('_npx')) return 'npx';
  if (argv1.includes('node_modules')) return 'local';
  return 'global';
}

export interface ScaffoldResult {
  status: 'initialized';
  mode: OperatingMode;
  config: string;
  repos: string[];
  shards_written: boolean;
  shards_skipped?: string[];
  skills_installed?: string[];
  hooks_installed?: string[];
}

export async function scaffoldWorkspace(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { workspaceRoot, mode, repos, monoRepoOptions } = options;
  const configPath = join(workspaceRoot, 'ctx.yaml');

  // Install skills first so we can persist the skills map in ctx.yaml
  const skills_installed: string[] = [];
  const skillsMap: Record<string, SkillEntry> = {};
  if (options.agents) {
    for (const agent of options.agents) {
      const scope = options.agentScopes?.[agent] ?? 'workspace';
      const dest = installSkill(workspaceRoot, agent, scope, options.homeDir);
      skills_installed.push(dest);
      skillsMap[agent] = { path: dest, scope };
    }
  }

  // Install Claude Code SessionStart hook (opt-out with hook: false)
  const hooks_installed: string[] = [];
  if (options.hook !== false && options.agents?.includes('claude')) {
    const scope = options.agentScopes?.['claude'] ?? 'workspace';
    const install_method_for_hook = options.install_method ?? detectInstallMethod();
    const hookCmd = installClaudeHook(
      workspaceRoot,
      install_method_for_hook,
      scope,
      options.homeDir,
    );
    hooks_installed.push(hookCmd);
  }

  // Detect install method (use provided override or auto-detect)
  const install_method = options.install_method ?? detectInstallMethod();

  // Generate and write ctx.yaml with skills and install_method
  const ctxifyVersion = getCtxifyVersion();
  const config = generateDefaultConfig(
    workspaceRoot,
    repos,
    mode,
    monoRepoOptions,
    undefined,
    Object.keys(skillsMap).length > 0 ? skillsMap : undefined,
    install_method,
    ctxifyVersion,
    mode === 'multi-repo' ? options.primaryRepo : undefined,
  );
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
  const skipped: string[] = [];

  if (mode === 'multi-repo') {
    // Multi-repo: per-repo .ctxify/ directories inside each repo
    const primaryRepoName = resolvePrimaryRepo(config);

    for (const repo of repoTemplateDataList) {
      const perRepoDir = resolveRepoCtxDir(workspaceRoot, repo, mode, outputDir);
      mkdirSync(perRepoDir, { recursive: true });

      // overview.md
      const overviewPath = join(perRepoDir, 'overview.md');
      if (!existsSync(overviewPath) || options.force) {
        // Smart migration: copy from root .ctxify/repos/{name}/ if it has filled content
        const legacyOverview = join(outputRoot, 'repos', repo.name, 'overview.md');
        if (existsSync(legacyOverview)) {
          const legacyContent = readFileSync(legacyOverview, 'utf-8');
          if (!legacyContent.includes('<!-- TODO:')) {
            writeFileSync(overviewPath, legacyContent, 'utf-8');
            continue;
          }
        }
        writeFileSync(overviewPath, generateRepoTemplate(repo, ctxifyVersion), 'utf-8');
      } else {
        skipped.push(`${repo.path}/.ctxify/overview.md`);
      }

      // corrections.md
      const correctionsPath = join(perRepoDir, 'corrections.md');
      if (!existsSync(correctionsPath) || options.force) {
        const legacyCorrections = join(outputRoot, 'repos', repo.name, 'corrections.md');
        if (existsSync(legacyCorrections)) {
          writeFileSync(correctionsPath, readFileSync(legacyCorrections, 'utf-8'), 'utf-8');
        } else {
          writeFileSync(
            correctionsPath,
            generateCorrectionsTemplate({ repo: repo.name, ctxifyVersion }),
            'utf-8',
          );
        }
      }
    }

    // workspace.md and rules.md in primary repo's .ctxify/ only
    if (primaryRepoName) {
      const primaryEntry = repos.find((r) => r.name === primaryRepoName);
      if (primaryEntry) {
        const primaryDir = resolveRepoCtxDir(workspaceRoot, primaryEntry, mode, outputDir);
        mkdirSync(primaryDir, { recursive: true });
        const workspaceMdPath = join(primaryDir, 'workspace.md');
        if (!existsSync(workspaceMdPath) || options.force) {
          writeFileSync(
            workspaceMdPath,
            generateWorkspaceTemplate(repoTemplateDataList, workspaceRoot, primaryRepoName, {
              ctxifyVersion,
            }),
            'utf-8',
          );
        } else {
          skipped.push(`${primaryEntry.path}/.ctxify/workspace.md`);
        }

        // Workspace-level rules.md
        const rulesPath = join(primaryDir, 'rules.md');
        if (!existsSync(rulesPath) || options.force) {
          // Smart migration: merge any existing per-repo rules.md files
          const mergedRules = mergePerRepoRules(workspaceRoot, repos, mode, outputDir, outputRoot);
          if (mergedRules) {
            writeFileSync(rulesPath, mergedRules, 'utf-8');
          } else {
            writeFileSync(rulesPath, generateRulesTemplate({ ctxifyVersion }), 'utf-8');
          }
        }
      }
    }

    // Root .ctxify/index.md — generated hub with links to per-repo files
    const indexPath = join(outputRoot, 'index.md');
    if (!existsSync(indexPath) || options.force) {
      writeFileSync(
        indexPath,
        generateIndexTemplate(repoTemplateDataList, workspaceRoot, mode, {
          ctxifyVersion,
          primaryRepo: primaryRepoName,
        }),
        'utf-8',
      );
    } else {
      skipped.push('index.md');
    }

    // Messaging hint
    console.error(
      "Multi-repo mode: context persisted in each repo's .ctxify/ directory. Commit with regular git. Run agents from the workspace root for full context.",
    );
  } else {
    // Single-repo and mono-repo: existing behavior — root .ctxify/repos/{name}/
    const indexPath = join(outputRoot, 'index.md');
    if (!existsSync(indexPath) || options.force) {
      writeFileSync(
        indexPath,
        generateIndexTemplate(repoTemplateDataList, workspaceRoot, mode, {
          ctxifyVersion,
        }),
        'utf-8',
      );
    } else {
      skipped.push('index.md');
    }

    for (const repo of repoTemplateDataList) {
      const repoDir = join(outputRoot, 'repos', repo.name);
      mkdirSync(repoDir, { recursive: true });
      const overviewPath = join(repoDir, 'overview.md');
      if (!existsSync(overviewPath) || options.force) {
        writeFileSync(overviewPath, generateRepoTemplate(repo, ctxifyVersion), 'utf-8');
      } else {
        skipped.push(`repos/${repo.name}/overview.md`);
      }
    }

    // Workspace-level rules.md at root .ctxify/
    const rulesPath = join(outputRoot, 'rules.md');
    if (!existsSync(rulesPath) || options.force) {
      // Smart migration: merge any existing per-repo rules.md files
      const mergedRules = mergePerRepoRules(workspaceRoot, repos, mode, outputDir, outputRoot);
      if (mergedRules) {
        writeFileSync(rulesPath, mergedRules, 'utf-8');
      } else {
        writeFileSync(rulesPath, generateRulesTemplate({ ctxifyVersion }), 'utf-8');
      }
    }
  }

  return {
    status: 'initialized',
    mode,
    config: configPath,
    repos: repos.map((r) => r.name),
    shards_written: true,
    ...(skipped.length > 0 ? { shards_skipped: skipped } : {}),
    ...(skills_installed.length > 0 ? { skills_installed } : {}),
    ...(hooks_installed.length > 0 ? { hooks_installed } : {}),
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
    .option('--primary-repo <name>', 'Multi-repo: repo that hosts workspace context (workspace.md)')
    .option('-f, --force', 'Overwrite existing ctx.yaml and .ctxify/')
    .option(
      '--hook',
      'Install Claude Code SessionStart hook to auto-load context (default: true with --agent claude)',
    )
    .option('--no-hook', 'Skip installing the Claude Code SessionStart hook')
    .action(
      async (
        dir?: string,
        options?: {
          repos?: string[];
          mono?: boolean;
          agent?: string[];
          primaryRepo?: string;
          force?: boolean;
          hook?: boolean;
        },
      ) => {
        const workspaceRoot = resolve(dir || '.');
        const configPath = join(workspaceRoot, 'ctx.yaml');

        // 0. If CWD is inside an existing workspace, refuse
        if (!existsSync(configPath)) {
          const parentRoot = findWorkspaceRoot(workspaceRoot);
          if (parentRoot) {
            console.log(
              JSON.stringify({
                error: `This directory is inside an existing ctxify workspace at ${parentRoot}. Run "ctxify init" from the workspace root, or use --dir to specify a different root.`,
              }),
            );
            process.exit(1);
          }
        }

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
            primaryRepo: options?.primaryRepo,
            force: options?.force,
            agents,
            hook: options?.hook,
          };
        }

        // 3. Scaffold workspace
        const result = await scaffoldWorkspace(scaffoldOptions);

        // 4. Output JSON summary
        console.log(JSON.stringify(result, null, 2));

        // 5. Next step hint (stderr so it doesn't pollute JSON output)
        if (result.skills_installed && result.skills_installed.length > 0) {
          // Derive hints from installed destination paths
          const hints = Object.entries(AGENT_CONFIGS)
            .filter(([, c]) => {
              const workspacePath = join(c.destDir, c.primaryFilename);
              const globalPath = c.globalDestDir
                ? join('~', c.globalDestDir, c.primaryFilename)
                : null;
              return result.skills_installed!.some((p) => p === workspacePath || p === globalPath);
            })
            .map(([, c]) => c.nextStepHint);
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

/**
 * Smart migration: check for existing per-repo rules.md files with content
 * and merge them into a single workspace-level rules.md.
 * Returns merged content string, or null if no per-repo rules files have content.
 */
function mergePerRepoRules(
  workspaceRoot: string,
  repos: RepoEntry[],
  mode: OperatingMode,
  outputDir: string,
  outputRoot: string,
): string | null {
  const entries: string[] = [];

  for (const repo of repos) {
    // Check per-repo location (multi-repo: {repo}/.ctxify/rules.md, single/mono: .ctxify/repos/{name}/rules.md)
    const perRepoPath =
      mode === 'multi-repo'
        ? join(workspaceRoot, repo.path, '.ctxify', 'rules.md')
        : join(outputRoot, 'repos', repo.name, 'rules.md');

    if (!existsSync(perRepoPath)) continue;
    const content = readFileSync(perRepoPath, 'utf-8');
    // Strip frontmatter and heading — only keep entries
    const stripped = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
    // Skip if only heading and no entries
    if (
      !stripped ||
      stripped === '# Rules' ||
      stripped ===
        '# Rules\n\nBehavioral instructions and anti-patterns. Always loaded — these are the highest-signal context.'
    )
      continue;
    entries.push(stripped);
  }

  if (entries.length === 0) return null;

  const ctxifyVersion = getCtxifyVersion();
  const header = generateRulesTemplate({ ctxifyVersion });
  return header + '\n' + entries.join('\n\n') + '\n';
}
