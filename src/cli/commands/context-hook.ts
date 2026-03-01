import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';

/**
 * Outputs a compact summary of available corrections/rules for Claude Code SessionStart hook.
 * Counts segment markers instead of injecting full file content — agents invoke /ctxify to load details.
 * Designed to be fast and silent — exits 0 with no output if nothing is found.
 */
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

  // Count entries per repo
  const repoSummaries: string[] = [];

  for (const repo of repoDirs) {
    let corrections = 0;
    let rules = 0;

    const correctionsPath = join(reposDir, repo, 'corrections.md');
    if (existsSync(correctionsPath)) {
      try {
        const content = readFileSync(correctionsPath, 'utf-8');
        corrections = (content.match(/<!-- correction:/g) || []).length;
      } catch {
        // Skip unreadable files
      }
    }

    const rulesPath = join(reposDir, repo, 'rules.md');
    if (existsSync(rulesPath)) {
      try {
        const content = readFileSync(rulesPath, 'utf-8');
        rules = (content.match(/<!-- (?:rule|antipattern):/g) || []).length;
      } catch {
        // Skip unreadable files
      }
    }

    if (corrections === 0 && rules === 0) continue;

    const counts: string[] = [];
    if (corrections > 0) counts.push(`${corrections} correction${corrections === 1 ? '' : 's'}`);
    if (rules > 0) counts.push(`${rules} rule${rules === 1 ? '' : 's'}`);
    repoSummaries.push(`${repo} (${counts.join(', ')})`);
  }

  const nudge = 'ctxify workspace detected.';
  const cta = 'Invoke /ctxify to load codebase context before coding.';

  if (repoSummaries.length > 0) {
    return `${nudge} Context: ${repoSummaries.join(', ')}. ${cta}`;
  }

  return `${nudge} ${cta}`;
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
