import { join } from 'node:path';
import type { RepoEntry, CtxConfig, OperatingMode } from './config.js';

/**
 * Resolve the directory where a repo's context files live.
 *
 * - multi-repo: `{workspaceRoot}/{repoEntry.path}/.ctxify`
 * - single-repo / mono-repo: `{workspaceRoot}/{outputDir}/repos/{repoEntry.name}`
 */
export function resolveRepoCtxDir(
  workspaceRoot: string,
  repoEntry: RepoEntry,
  mode: OperatingMode,
  outputDir: string,
): string {
  if (mode === 'multi-repo') {
    return join(workspaceRoot, repoEntry.path, '.ctxify');
  }
  return join(workspaceRoot, outputDir, 'repos', repoEntry.name);
}

/**
 * Return the primary repo name from config.
 * Falls back to the first repo if `primary_repo` is not set.
 */
export function resolvePrimaryRepo(config: CtxConfig): string | undefined {
  if (config.primary_repo) return config.primary_repo;
  if (config.repos.length > 0) return config.repos[0].name;
  return undefined;
}

/**
 * Resolve the directory where workspace-level rules.md lives.
 *
 * - multi-repo: `{workspaceRoot}/{primaryRepo.path}/.ctxify`
 * - single-repo / mono-repo: `{workspaceRoot}/{outputDir}`
 */
export function resolveWorkspaceRulesDir(
  workspaceRoot: string,
  config: CtxConfig,
  outputDir: string,
): string {
  if (config.mode === 'multi-repo') {
    const primaryName = resolvePrimaryRepo(config);
    if (primaryName) {
      const primaryEntry = config.repos.find((r) => r.name === primaryName);
      if (primaryEntry) {
        return join(workspaceRoot, primaryEntry.path, '.ctxify');
      }
    }
    // Fallback: first repo
    if (config.repos.length > 0) {
      return join(workspaceRoot, config.repos[0].path, '.ctxify');
    }
  }
  return join(workspaceRoot, outputDir);
}
