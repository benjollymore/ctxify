import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface VersionCheckOptions {
  cacheFile?: string;
  ttlMs?: number;
  fetchFn?: () => Promise<string>;
  timeoutMs?: number;
}

interface VersionCache {
  checked_at: string;
  latest: string;
}

const DEFAULT_CACHE_FILE = join(homedir(), '.ctxify', 'version-check.json');
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1_000; // 6 hours
const DEFAULT_TIMEOUT_MS = 500;
const REGISTRY_URL = 'https://registry.npmjs.org/@benjollymore/ctxify/latest';

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(REGISTRY_URL);
  if (!response.ok) {
    throw new Error(`Registry responded with ${response.status}`);
  }
  const data = (await response.json()) as { version: string };
  return data.version;
}

function readCache(cacheFile: string): VersionCache | null {
  if (!existsSync(cacheFile)) return null;
  try {
    return JSON.parse(readFileSync(cacheFile, 'utf-8')) as VersionCache;
  } catch {
    return null;
  }
}

function writeCache(cacheFile: string, latest: string): void {
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ checked_at: new Date().toISOString(), latest }), 'utf-8');
  } catch {
    // Non-fatal — cache write failure should not block commands
  }
}

function isCacheFresh(cache: VersionCache, ttlMs: number): boolean {
  const checkedAt = new Date(cache.checked_at).getTime();
  return Date.now() - checkedAt < ttlMs;
}

/**
 * Check if a newer version is available. Returns the latest version string if
 * the current version is outdated, or undefined if up-to-date or the check fails.
 *
 * The check is capped at `timeoutMs` (default 500ms) and fails silently on
 * network errors or cache corruption.
 */
export async function checkForUpdate(
  currentVersion: string,
  opts: VersionCheckOptions = {},
): Promise<string | undefined> {
  const cacheFile = opts.cacheFile ?? DEFAULT_CACHE_FILE;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const fetchFn = opts.fetchFn ?? fetchLatestVersion;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    // Try cache first
    const cache = readCache(cacheFile);
    let latest: string;

    if (cache && isCacheFresh(cache, ttlMs)) {
      latest = cache.latest;
    } else {
      // Fetch with timeout cap
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('version check timed out')), timeoutMs),
      );
      latest = await Promise.race([fetchFn(), timeout]);
      writeCache(cacheFile, latest);
    }

    // Compare: return latest only if it's actually newer
    return latest !== currentVersion ? latest : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Delete the version check cache file. Call after a successful upgrade so
 * the next command immediately checks for updates again.
 */
export function invalidateVersionCache(cacheFile = DEFAULT_CACHE_FILE): void {
  try {
    if (existsSync(cacheFile)) {
      rmSync(cacheFile);
    }
  } catch {
    // Non-fatal
  }
}
