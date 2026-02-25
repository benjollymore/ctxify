import type { CacheStore, CacheEntry } from './cache.js';
import type { WorkspaceContext } from './context.js';
import { getHeadSha, getTrackedFiles } from '../utils/git.js';
import { hashFileSet } from '../utils/hash.js';
import { join } from 'node:path';

export interface StalenessReport {
  staleRepos: string[];
  freshRepos: string[];
  isFullyFresh: boolean;
}

export async function computeStaleness(
  ctx: WorkspaceContext,
  cache: CacheStore | null,
): Promise<StalenessReport> {
  if (!cache) {
    return {
      staleRepos: ctx.repos.map((r) => r.name),
      freshRepos: [],
      isFullyFresh: false,
    };
  }

  const staleRepos: string[] = [];
  const freshRepos: string[] = [];

  for (const repo of ctx.repos) {
    const cached = cache.repos[repo.name];
    if (!cached) {
      staleRepos.push(repo.name);
      continue;
    }

    try {
      const currentSha = await getHeadSha(repo.path);
      if (currentSha !== cached.gitSha) {
        staleRepos.push(repo.name);
        continue;
      }

      // Git SHA matches — check file hashes for uncommitted changes
      const trackedFiles = await getTrackedFiles(repo.path);
      const fullPaths = trackedFiles.map((f) => join(repo.path, f));
      const currentHash = hashFileSet(fullPaths);
      const cachedHash = cached.fileHashes['_overall'] || '';

      if (currentHash !== cachedHash) {
        staleRepos.push(repo.name);
      } else {
        freshRepos.push(repo.name);
      }
    } catch {
      staleRepos.push(repo.name);
    }
  }

  return {
    staleRepos,
    freshRepos,
    isFullyFresh: staleRepos.length === 0,
  };
}

export async function buildCacheEntry(repoPath: string): Promise<CacheEntry> {
  const gitSha = await getHeadSha(repoPath);
  const files = await getTrackedFiles(repoPath);
  const fileHashes: Record<string, string> = {};
  const fullPaths = files.map((f) => join(repoPath, f));
  const overallHash = hashFileSet(fullPaths);

  return {
    gitSha,
    fileHashes: { _overall: overallHash },
    scannedAt: new Date().toISOString(),
  };
}
