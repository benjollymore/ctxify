import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';

/**
 * Reads .ctxify/ corrections and outputs context for Claude Code SessionStart hook.
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

  const parts: string[] = [];

  // Collect corrections from all repos
  let repoDirs: string[];
  try {
    repoDirs = readdirSync(reposDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return '';
  }

  for (const repo of repoDirs) {
    for (const filename of ['corrections.md', 'rules.md']) {
      const filePath = join(reposDir, repo, filename);
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf-8').trim();
          if (content) {
            parts.push(content);
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  // Add nudge message
  parts.push(
    'ctxify workspace detected. Invoke /ctxify-startup to initialize context for this session.',
  );

  return parts.join('\n\n');
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
