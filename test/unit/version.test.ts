import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('getCtxifyVersion', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CTXIFY_CURRENT_VERSION;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CTXIFY_CURRENT_VERSION;
    } else {
      process.env.CTXIFY_CURRENT_VERSION = originalEnv;
    }
  });

  it('returns env var when CTXIFY_CURRENT_VERSION is set', async () => {
    process.env.CTXIFY_CURRENT_VERSION = '9.9.9-test';
    // Re-import to get a fresh module — but getCtxifyVersion reads env at call time, not import time
    const { getCtxifyVersion } = await import('../../src/utils/version.js');
    expect(getCtxifyVersion()).toBe('9.9.9-test');
  });

  it('falls back to package.json walk-up when env var is unset', async () => {
    delete process.env.CTXIFY_CURRENT_VERSION;
    const { getCtxifyVersion } = await import('../../src/utils/version.js');
    const version = getCtxifyVersion();
    // Should find the repo's package.json and return a valid semver-ish string
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(version).not.toBe('0.0.0');
  });

  it('returns a string, never undefined or null', async () => {
    delete process.env.CTXIFY_CURRENT_VERSION;
    const { getCtxifyVersion } = await import('../../src/utils/version.js');
    const version = getCtxifyVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });
});
