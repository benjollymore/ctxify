import { join, resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { RepoEntry, CtxConfig, OperatingMode } from './config.js';
import { ConfigError } from './errors.js';

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

/**
 * Walk up from startDir looking for ctx.yaml.
 * Returns the directory containing ctx.yaml, or null if not found.
 * Stops at filesystem root.
 */
export function findWorkspaceRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, 'ctx.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/**
 * Resolve workspace root from --dir option or CWD.
 * If ctx.yaml isn't at the resolved dir, walks up to find it.
 * Returns { root, fromParent } where fromParent indicates the user is inside a sub-repo.
 * Throws ConfigError if no ctx.yaml found anywhere.
 */
export function resolveWorkspaceRootOrThrow(dirOption?: string): {
  root: string;
  fromParent: boolean;
} {
  const startDir = resolve(dirOption || '.');
  if (existsSync(join(startDir, 'ctx.yaml'))) {
    return { root: startDir, fromParent: false };
  }
  const found = findWorkspaceRoot(startDir);
  if (found) {
    return { root: found, fromParent: true };
  }
  throw new ConfigError('No ctx.yaml found. Run "ctxify init" first.');
}
