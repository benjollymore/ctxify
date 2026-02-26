import { select, confirm, checkbox } from '@inquirer/prompts';
import { basename, resolve, relative } from 'node:path';
import { autoDetectMode } from '../../core/detect.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import type { OperatingMode, RepoEntry, MonoRepoOptions } from '../../core/config.js';
import type { AgentType, ScaffoldOptions } from './init.js';
import { findGitRoots } from '../../utils/git.js';

export interface InteractiveAnswers {
  workspaceRoot: string;
  agent?: AgentType;
  confirmedMode: OperatingMode;
  repos: RepoEntry[];
  monoRepoOptions?: MonoRepoOptions;
}

/**
 * Pure function: convert interactive answers into ScaffoldOptions.
 * Separated from prompts for testability.
 */
export function resolveInteractiveOptions(answers: InteractiveAnswers): ScaffoldOptions {
  return {
    workspaceRoot: answers.workspaceRoot,
    mode: answers.confirmedMode,
    repos: answers.repos,
    monoRepoOptions: answers.monoRepoOptions,
    agent: answers.agent,
  };
}

/**
 * Run the interactive prompt flow. Collects all info needed for scaffolding.
 */
export async function runInteractiveFlow(workspaceRoot: string): Promise<ScaffoldOptions> {
  // Step 1: Agent selection
  const agentChoice = await select({
    message: 'Which AI agent do you use?',
    choices: [
      { name: 'Claude Code', value: 'claude' as const },
      { name: 'Skip (no skill installation)', value: 'skip' as const },
    ],
  });
  const agent: AgentType | undefined = agentChoice === 'skip' ? undefined : agentChoice;

  // Step 2: Auto-detect and confirm mode
  const detection = autoDetectMode(workspaceRoot);
  const modeConfirmed = await confirm({
    message: `Detected workspace mode: ${detection.mode}. Is this correct?`,
    default: true,
  });

  let mode: OperatingMode;
  if (modeConfirmed) {
    mode = detection.mode;
  } else {
    mode = await select({
      message: 'Select workspace mode:',
      choices: [
        { name: 'Single repo', value: 'single-repo' as const },
        { name: 'Multi-repo (separate repos in subdirectories)', value: 'multi-repo' as const },
        { name: 'Mono-repo (workspaces in one repo)', value: 'mono-repo' as const },
      ],
    });
  }

  // Step 3: Resolve repos based on mode
  let repos: RepoEntry[];
  let monoRepoOptions: MonoRepoOptions | undefined;

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
    repos = [{ path: '.', name: basename(workspaceRoot) }];
  } else {
    // multi-repo: discover and let user confirm
    const discovered = discoverMultiRepoEntries(workspaceRoot);

    if (discovered.length === 0) {
      console.log('No repositories found in subdirectories.');
      repos = [];
    } else {
      const includeAll = await confirm({
        message: `Found ${discovered.length} repositories:\n${discovered.map((r) => `  • ${r.name} (./${r.path})`).join('\n')}\nInclude all?`,
        default: true,
      });

      if (includeAll) {
        repos = discovered;
      } else {
        const selected = await checkbox({
          message: 'Select repositories to include:',
          choices: discovered.map((r) => ({
            name: `${r.name} (./${r.path})`,
            value: r,
            checked: true,
          })),
        });
        repos = selected;
      }
    }
  }

  return resolveInteractiveOptions({
    workspaceRoot,
    agent,
    confirmedMode: mode,
    repos,
    monoRepoOptions,
  });
}

function discoverMultiRepoEntries(workspaceRoot: string): RepoEntry[] {
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
