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

When you discover context is wrong → \`ctxify feedback <repo> --body "what's wrong and what's correct"\`
When the user corrects your behavior or says "don't do X" → STOP and run \`ctxify feedback --type rule --body "the rule"\` before continuing. No repo arg needed — rules are workspace-wide.
Before working in a domain area that has no context file → \`ctxify domain add <repo> <domain-name> --description "..."\` then fill it before starting the feature.`;

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
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

  // Check if any overview.md has TODO markers → unfilled
  for (const repo of repoNames) {
    const overviewPath = join(reposDir, repo, 'overview.md');
    if (existsSync(overviewPath)) {
      try {
        const content = readFileSync(overviewPath, 'utf-8');
        if (content.includes('<!-- TODO:')) {
          return 'ctxify workspace detected. Context is unfilled. Invoke /ctxify-filling-context to document the codebase.';
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Context is filled — concatenate always-load files
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

  // Per-repo: overview.md, corrections.md
  for (const repo of repoNames) {
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

  return sections.join('\n\n') + '\n\n' + CONTEXT_FOOTER;
}

function getMultiRepoHookOutput(
  workspaceRoot: string,
  config: ReturnType<typeof loadConfig>,
  outputRoot: string,
  outputDir: string,
): string {
  // Check if any per-repo overview.md has TODO markers → unfilled
  for (const repo of config.repos) {
    const repoCtxDir = resolveRepoCtxDir(workspaceRoot, repo, config.mode, outputDir);
    const overviewPath = join(repoCtxDir, 'overview.md');
    if (existsSync(overviewPath)) {
      try {
        const content = readFileSync(overviewPath, 'utf-8');
        if (content.includes('<!-- TODO:')) {
          return 'ctxify workspace detected. Context is unfilled. Invoke /ctxify-filling-context to document the codebase.';
        }
      } catch {
        // Skip unreadable files
      }
    }
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

  // Per-repo: overview.md, corrections.md
  for (const repo of config.repos) {
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

  return sections.join('\n\n') + '\n\n' + CONTEXT_FOOTER;
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
