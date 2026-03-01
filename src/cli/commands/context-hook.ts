import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';

/**
 * Outputs the content of always-load context files for Claude Code SessionStart hook.
 * When context is filled, concatenates index.md + overview.md + corrections.md + rules.md
 * (frontmatter stripped) so agents start with full context loaded.
 * When context is unfilled (TODO markers in overview.md), outputs a nudge to fill context.
 * Designed to be fast and silent — exits 0 with no output if nothing is found.
 */

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
}

export function getContextHookOutput(workspaceRoot: string): string {
  const configPath = join(workspaceRoot, 'ctx.yaml');

  // No config → nothing to output
  if (!existsSync(configPath)) return '';

  let outputDir = '.ctxify';
  try {
    const config = loadConfig(configPath);
    if (config.options.outputDir) {
      outputDir = config.options.outputDir;
    }
  } catch {
    // If config is malformed, try default outputDir
  }

  const outputRoot = join(workspaceRoot, outputDir);
  const reposDir = join(outputRoot, 'repos');

  if (!existsSync(reposDir)) return '';

  let repoDirs: string[];
  try {
    repoDirs = readdirSync(reposDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return '';
  }

  // Check if any overview.md has TODO markers → unfilled
  for (const repo of repoDirs) {
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

  // Per-repo: overview.md, corrections.md, rules.md
  for (const repo of repoDirs) {
    const overviewPath = join(reposDir, repo, 'overview.md');
    if (existsSync(overviewPath)) {
      try {
        const content = readFileSync(overviewPath, 'utf-8');
        sections.push(stripFrontmatter(content).trim());
      } catch {
        // Skip unreadable files
      }
    }

    const correctionsPath = join(reposDir, repo, 'corrections.md');
    if (existsSync(correctionsPath)) {
      try {
        const content = readFileSync(correctionsPath, 'utf-8');
        const body = stripFrontmatter(content).trim();
        if (body) sections.push(body);
      } catch {
        // Skip unreadable files
      }
    }

    const rulesPath = join(reposDir, repo, 'rules.md');
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

  if (sections.length === 0) return '';

  const footer =
    'Load patterns.md before writing code. Load domain files when entering specific areas.';
  return sections.join('\n\n') + '\n\n' + footer;
}

export function registerContextHookCommand(program: Command): void {
  program
    .command('context-hook')
    .description('Output context for Claude Code SessionStart hook (internal)')
    .action(() => {
      const workspaceRoot = resolve('.');
      const output = getContextHookOutput(workspaceRoot);
      if (output) {
        console.log(output);
      }
    });
}
