import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface CacheEntry {
  gitSha: string;
  fileHashes: Record<string, string>;
  scannedAt: string;
}

export interface CacheStore {
  version: string;
  repos: Record<string, CacheEntry>;
}

const CACHE_VERSION = '1';

export function loadCache(workspaceRoot: string, outputDir: string): CacheStore | null {
  const cachePath = join(workspaceRoot, outputDir, '.cache', 'scan-cache.json');
  if (!existsSync(cachePath)) return null;

  try {
    const content = readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(content) as CacheStore;
    if (data.version !== CACHE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveCache(workspaceRoot: string, outputDir: string, cache: CacheStore): void {
  const cacheDir = join(workspaceRoot, outputDir, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, 'scan-cache.json');
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}

export function createCacheStore(): CacheStore {
  return {
    version: CACHE_VERSION,
    repos: {},
  };
}
