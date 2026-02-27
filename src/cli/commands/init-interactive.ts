import { select, confirm, checkbox } from '@inquirer/prompts';
import { basename } from 'node:path';
import { autoDetectMode } from '../../core/detect.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import type { OperatingMode, RepoEntry, MonoRepoOptions } from '../../core/config.js';
import type { AgentType, ScaffoldOptions } from './init.js';
import { buildMultiRepoEntries } from './init.js';
import { AGENT_CONFIGS } from '../install-skill.js';

export interface InteractiveAnswers {
  workspaceRoot: string;
  agents?: AgentType[];
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
    agents: answers.agents,
  };
}

/**
 * Run the interactive prompt flow. Collects all info needed for scaffolding.
 */
export async function runInteractiveFlow(workspaceRoot: string): Promise<ScaffoldOptions> {
  // Step 1: Agent selection (multi-select)
  const agentChoices = Object.entries(AGENT_CONFIGS).map(([key, config]) => ({
    name: config.displayName,
    value: key as AgentType,
    checked: key === 'claude',
  }));

  const selectedAgents = await checkbox({
    message: 'Which AI agents do you use? (select all that apply)',
    choices: agentChoices,
  });
  const agents: AgentType[] | undefined = selectedAgents.length > 0 ? selectedAgents : undefined;

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
    const discovered = buildMultiRepoEntries(workspaceRoot);

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
    agents,
    confirmedMode: mode,
    repos,
    monoRepoOptions,
  });
}