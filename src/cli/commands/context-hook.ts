import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { resolveRepoCtxDir, resolvePrimaryRepo, findWorkspaceRoot } from '../../core/paths.js';

/**
 * Outputs the content of always-load context files for Claude Code SessionStart hook.
 * When context is filled, concatenates index.md + overview.md + corrections.md + rules.md
 * (frontmatter stripped) so agents start with full context loaded.
 * When context is unfilled (TODO markers in overview.md), outputs a nudge to fill context.
 * Designed to be fast and silent — exits 0 with no output if nothing is found.
 */

const CONTEXT_FOOTER = `Load patterns.md before writing code. Load domain files when entering specific areas.

When you discover context is wrong, or the user says something documented is incorrect → \`ctxify feedback <repo> --body "what's wrong and what's correct"\`
When the user states a preference ("don't do X", "always use Y", "use X instead of Y", "only use X", "never X", "we switched to X", "prefer X over Y", "X is deprecated/the standard") → STOP and run \`ctxify feedback --type rule --body "the rule"\` before continuing. No repo arg needed — rules are workspace-wide.
Before working in a domain area that has no context file → STOP. Run \`ctxify domain add <repo> <domain-name> --description "..."\` and fill it before starting the feature.`;

const UNFILLED_NUDGE =
  'ctxify workspace detected. Context is unfilled. Invoke /ctxify-filling-context to document the codebase.';

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
}

/**
 * True if an overview still holds a scaffold TODO marker. Fenced code blocks are
 * stripped first so a filled overview that *documents* a `<!-- TODO: -->` example
 * isn't misread as unfilled.
 */
function overviewIsUnfilled(content: string): boolean {
  const withoutFences = content.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
  return withoutFences.includes('<!-- TODO:');
}

/** Targeted nudge naming the repos that still need documenting, for partial fills. */
function partialFillNudge(unfilledRepos: string[]): string {
  return `Note: these repos are not yet documented: ${unfilledRepos.join(', ')}. Run \`/ctxify-filling-context\` for them before working in those areas.`;
}

export function getContextHookOutput(workspaceRoot: string): string {
  const configPath = join(workspaceRoot, 'ctx.yaml');

  // No config → nothing to output
  if (!existsSync(configPath)) return '';

  let config;
  let outputDir = '.ctxify';
  try {
    config = loadConfig(configPath);
    if (config.options.outputDir) {
      outputDir = config.options.outputDir;
    }
  } catch {
    // If config is malformed, try default outputDir
  }

  const outputRoot = join(workspaceRoot, outputDir);

  // Multi-repo mode: read from per-repo .ctxify/ directories
  if (config && config.mode === 'multi-repo' && config.repos.length > 0) {
    return getMultiRepoHookOutput(workspaceRoot, config, outputRoot, outputDir);
  }

  // Single-repo / mono-repo: read from root .ctxify/repos/{name}/
  // Use config.repos as source of truth (not filesystem scan) so untracked repos are ignored
  const reposDir = join(outputRoot, 'repos');
  if (!existsSync(reposDir)) return '';

  const repoNames = config
    ? config.repos.map((r) => r.name)
    : (() => {
        // Fallback: scan disk when config is malformed
        try {
          return readdirSync(reposDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
        } catch {
          return [];
        }
      })();

  if (repoNames.length === 0) return '';

  // Partition repos by fill status. A repo counts as filled when its overview.md
  // exists and no longer carries scaffold TODO markers. Loading is per-repo: a
  // documented repo's context is never discarded because a sibling is still unfilled.
  const filledRepos: string[] = [];
  const unfilledRepos: string[] = [];
  for (const repo of repoNames) {
    const overviewPath = join(reposDir, repo, 'overview.md');
    if (!existsSync(overviewPath)) continue;
    try {
      const content = readFileSync(overviewPath, 'utf-8');
      if (overviewIsUnfilled(content)) unfilledRepos.push(repo);
      else filledRepos.push(repo);
    } catch {
      // Skip unreadable files
    }
  }

  // Nothing documented yet (but something to document) → the all-unfilled nudge
  if (filledRepos.length === 0 && unfilledRepos.length > 0) {
    return UNFILLED_NUDGE;
  }

  // Concatenate always-load files for the documented repos
  const sections: string[] = [];

  // index.md
  const indexPath = join(outputRoot, 'index.md');
  if (existsSync(indexPath)) {
    try {
      const content = readFileSync(indexPath, 'utf-8');
      sections.push(stripFrontmatter(content).trim());
    } catch {
      // Skip unreadable files
    }
  }

  // Per-filled-repo: overview.md, corrections.md
  for (const repo of filledRepos) {
    for (const filename of ['overview.md', 'corrections.md']) {
      const filePath = join(reposDir, repo, filename);
      if (!existsSync(filePath)) continue;
      try {
        const content = readFileSync(filePath, 'utf-8');
        const body = stripFrontmatter(content).trim();
        if (body) sections.push(body);
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Workspace-level rules.md
  const rulesPath = join(outputRoot, 'rules.md');
  if (existsSync(rulesPath)) {
    try {
      const content = readFileSync(rulesPath, 'utf-8');
      const body = stripFrontmatter(content).trim();
      if (body) sections.push(body);
    } catch {
      // Skip unreadable files
    }
  }

  if (sections.length === 0) return '';

  const trailer =
    unfilledRepos.length > 0
      ? partialFillNudge(unfilledRepos) + '\n\n' + CONTEXT_FOOTER
      : CONTEXT_FOOTER;

  return sections.join('\n\n') + '\n\n' + trailer;
}

function getMultiRepoHookOutput(
  workspaceRoot: string,
  config: ReturnType<typeof loadConfig>,
  outputRoot: string,
  outputDir: string,
): string {
  // Partition repos by fill status. Loading is per-repo: a documented repo's
  // context is never discarded because a sibling repo is still unfilled.
  const filledRepos: typeof config.repos = [];
  const unfilledRepoNames: string[] = [];
  for (const repo of config.repos) {
    const repoCtxDir = resolveRepoCtxDir(workspaceRoot, repo, config.mode, outputDir);
    const overviewPath = join(repoCtxDir, 'overview.md');
    if (!existsSync(overviewPath)) continue;
    try {
      const content = readFileSync(overviewPath, 'utf-8');
      if (overviewIsUnfilled(content)) unfilledRepoNames.push(repo.name);
      else filledRepos.push(repo);
    } catch {
      // Skip unreadable files
    }
  }

  // Nothing documented yet (but something to document) → the all-unfilled nudge
  if (filledRepos.length === 0 && unfilledRepoNames.length > 0) {
    return UNFILLED_NUDGE;
  }

  const sections: string[] = [];

  // Root index.md (generated hub)
  const indexPath = join(outputRoot, 'index.md');
  if (existsSync(indexPath)) {
    try {
      const content = readFileSync(indexPath, 'utf-8');
      sections.push(stripFrontmatter(content).trim());
    } catch {
      // Skip
    }
  }

  // workspace.md from primary repo
  const primaryName = resolvePrimaryRepo(config);
  if (primaryName) {
    const primaryEntry = config.repos.find((r) => r.name === primaryName);
    if (primaryEntry) {
      const primaryDir = resolveRepoCtxDir(workspaceRoot, primaryEntry, config.mode, outputDir);
      const workspaceMdPath = join(primaryDir, 'workspace.md');
      if (existsSync(workspaceMdPath)) {
        try {
          const content = readFileSync(workspaceMdPath, 'utf-8');
          sections.push(stripFrontmatter(content).trim());
        } catch {
          // Skip
        }
      }
    }
  }

  // Per-filled-repo: overview.md, corrections.md
  for (const repo of filledRepos) {
    const repoCtxDir = resolveRepoCtxDir(workspaceRoot, repo, config.mode, outputDir);

    for (const filename of ['overview.md', 'corrections.md']) {
      const filePath = join(repoCtxDir, filename);
      if (!existsSync(filePath)) continue;
      try {
        const content = readFileSync(filePath, 'utf-8');
        const body = stripFrontmatter(content).trim();
        if (body) sections.push(body);
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Workspace-level rules.md from primary repo's .ctxify/
  if (primaryName) {
    const primaryEntryForRules = config.repos.find((r) => r.name === primaryName);
    if (primaryEntryForRules) {
      const primaryDirForRules = resolveRepoCtxDir(
        workspaceRoot,
        primaryEntryForRules,
        config.mode,
        outputDir,
      );
      const rulesPath = join(primaryDirForRules, 'rules.md');
      if (existsSync(rulesPath)) {
        try {
          const content = readFileSync(rulesPath, 'utf-8');
          const body = stripFrontmatter(content).trim();
          if (body) sections.push(body);
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  if (sections.length === 0) return '';

  const trailer =
    unfilledRepoNames.length > 0
      ? partialFillNudge(unfilledRepoNames) + '\n\n' + CONTEXT_FOOTER
      : CONTEXT_FOOTER;

  return sections.join('\n\n') + '\n\n' + trailer;
}

export function registerContextHookCommand(program: Command): void {
  program
    .command('context-hook')
    .description('Output context for Claude Code SessionStart hook (internal)')
    .action(() => {
      let workspaceRoot = resolve('.');
      // If no ctx.yaml at CWD, walk up to find the workspace root
      if (!existsSync(join(workspaceRoot, 'ctx.yaml'))) {
        const found = findWorkspaceRoot(workspaceRoot);
        if (found) {
          workspaceRoot = found;
        }
      }
      const output = getContextHookOutput(workspaceRoot);
      if (output) {
        console.log(output);
      }
    });
}
