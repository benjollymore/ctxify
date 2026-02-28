import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkForUpdate, invalidateVersionCache } from '../../src/utils/version-check.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-version-check-'));
}

describe('checkForUpdate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined when current version matches latest', async () => {
    const cacheFile = join(tmpDir, 'version-check.json');
    const fetchFn = async () => '1.2.3';

    const result = await checkForUpdate('1.2.3', { cacheFile, ttlMs: 3_600_000, fetchFn });

    expect(result).toBeUndefined();
  });

  it('returns latest version when out of date', async () => {
    const cacheFile = join(tmpDir, 'version-check.json');
    const fetchFn = async () => '2.0.0';

    const result = await checkForUpdate('1.0.0', { cacheFile, ttlMs: 3_600_000, fetchFn });

    expect(result).toBe('2.0.0');
  });

  it('writes cache file after successful fetch', async () => {
    const cacheFile = join(tmpDir, 'version-check.json');
    const fetchFn = async () => '2.0.0';

    await checkForUpdate('1.0.0', { cacheFile, ttlMs: 3_600_000, fetchFn });

    expect(existsSync(cacheFile)).toBe(true);
    const cached = JSON.parse(readFileSync(cacheFile, 'utf-8'));
    expect(cached.latest).toBe('2.0.0');
    expect(typeof cached.checked_at).toBe('string');
  });

  it('uses cache when within TTL — does not call fetchFn', async () => {
    const cacheFile = join(tmpDir, 'version-check.json');

    // Pre-populate a valid cache with future timestamp
    const cache = {
      checked_at: new Date(Date.now() + 1_000_000).toISOString(), // still fresh
      latest: '2.0.0',
    };
    writeFileSync(cacheFile, JSON.stringify(cache), 'utf-8');

    let fetchCalled = false;
    const fetchFn = async () => {
      fetchCalled = true;
      return '3.0.0';
    };

    const result = await checkForUpdate('1.0.0', { cacheFile, ttlMs: 3_600_000, fetchFn });

    expect(fetchCalled).toBe(false);
    expect(result).toBe('2.0.0');
  });

  it('re-fetches when cache is expired', async () => {
    const cacheFile = join(tmpDir, 'version-check.json');

    // Pre-populate an expired cache
    const cache = {
      checked_at: new Date(0).toISOString(), // epoch = very old
      latest: '1.0.0',
    };
    writeFileSync(cacheFile, JSON.stringify(cache), 'utf-8');

    const fetchFn = async () => '3.0.0';

    const result = await checkForUpdate('1.0.0', { cacheFile, ttlMs: 3_600_000, fetchFn });

    expect(result).toBe('3.0.0');
  });

  it('returns undefined when cached latest is older than current (user upgraded ahead of cache)', async () => {
    const cacheFile = join(tmpDir, 'version-check.json');

    // Cache has 0.4.0 but user just installed 0.4.1
    const cache = {
      checked_at: new Date(Date.now() + 1_000_000).toISOString(), // still fresh
      latest: '0.4.0',
    };
    writeFileSync(cacheFile, JSON.stringify(cache), 'utf-8');

    let fetchCalled = false;
    const fetchFn = async () => {
      fetchCalled = true;
      return '0.4.0';
    };

    const result = await checkForUpdate('0.4.1', { cacheFile, ttlMs: 3_600_000, fetchFn });

    expect(fetchCalled).toBe(false); // cache was fresh, no fetch
    expect(result).toBeUndefined(); // should NOT warn — current is already newer
  });

  it('returns undefined when fetchFn throws (fail silently)', async () => {
    const cacheFile = join(tmpDir, 'version-check.json');
    const fetchFn = async (): Promise<string> => {
      throw new Error('network error');
    };

    const result = await checkForUpdate('1.0.0', { cacheFile, ttlMs: 3_600_000, fetchFn });

    expect(result).toBeUndefined();
  });

  it('returns undefined when fetchFn times out (resolves after cap)', async () => {
    const cacheFile = join(tmpDir, 'version-check.json');
    const fetchFn = (): Promise<string> =>
      new Promise((resolve) => setTimeout(() => resolve('2.0.0'), 10_000));

    const result = await checkForUpdate('1.0.0', {
      cacheFile,
      ttlMs: 3_600_000,
      fetchFn,
      timeoutMs: 10, // very short timeout for the test
    });

    expect(result).toBeUndefined();
  });
});

describe('invalidateVersionCache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deletes the cache file', async () => {
    const cacheFile = join(tmpDir, 'version-check.json');
    writeFileSync(
      cacheFile,
      JSON.stringify({ checked_at: new Date().toISOString(), latest: '1.0.0' }),
      'utf-8',
    );

    expect(existsSync(cacheFile)).toBe(true);
    invalidateVersionCache(cacheFile);
    expect(existsSync(cacheFile)).toBe(false);
  });

  it('does not throw when cache file does not exist', () => {
    const cacheFile = join(tmpDir, 'nonexistent.json');
    expect(() => invalidateVersionCache(cacheFile)).not.toThrow();
  });
});
