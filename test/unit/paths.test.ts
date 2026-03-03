import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveRepoCtxDir,
  resolvePrimaryRepo,
  resolveWorkspaceRulesDir,
  findWorkspaceRoot,
  resolveWorkspaceRootOrThrow,
} from '../../src/core/paths.js';
import { ConfigError } from '../../src/core/errors.js';
import type { CtxConfig, RepoEntry } from '../../src/core/config.js';

describe('resolveRepoCtxDir', () => {
  const repo: RepoEntry = { path: 'api', name: 'api' };

  it('returns per-repo .ctxify dir in multi-repo mode', () => {
    const result = resolveRepoCtxDir('/workspace', repo, 'multi-repo', '.ctxify');
    expect(result).toBe('/workspace/api/.ctxify');
  });

  it('returns root .ctxify/repos/{name} in single-repo mode', () => {
    const singleRepo: RepoEntry = { path: '.', name: 'myapp' };
    const result = resolveRepoCtxDir('/workspace', singleRepo, 'single-repo', '.ctxify');
    expect(result).toBe('/workspace/.ctxify/repos/myapp');
  });

  it('returns root .ctxify/repos/{name} in mono-repo mode', () => {
    const pkg: RepoEntry = { path: 'packages/core', name: 'core' };
    const result = resolveRepoCtxDir('/workspace', pkg, 'mono-repo', '.ctxify');
    expect(result).toBe('/workspace/.ctxify/repos/core');
  });

  it('respects custom outputDir', () => {
    const result = resolveRepoCtxDir('/workspace', repo, 'single-repo', '.context');
    expect(result).toBe('/workspace/.context/repos/api');
  });

  it('handles multi-repo with nested path', () => {
    const nested: RepoEntry = { path: 'services/auth', name: 'auth' };
    const result = resolveRepoCtxDir('/workspace', nested, 'multi-repo', '.ctxify');
    expect(result).toBe('/workspace/services/auth/.ctxify');
  });
});

describe('resolvePrimaryRepo', () => {
  it('returns primary_repo when set', () => {
    const config = {
      primary_repo: 'api',
      repos: [
        { path: 'web', name: 'web' },
        { path: 'api', name: 'api' },
      ],
    } as CtxConfig;
    expect(resolvePrimaryRepo(config)).toBe('api');
  });

  it('falls back to first repo when primary_repo is not set', () => {
    const config = {
      repos: [
        { path: 'web', name: 'web' },
        { path: 'api', name: 'api' },
      ],
    } as CtxConfig;
    expect(resolvePrimaryRepo(config)).toBe('web');
  });

  it('returns undefined when no repos', () => {
    const config = { repos: [] } as unknown as CtxConfig;
    expect(resolvePrimaryRepo(config)).toBeUndefined();
  });
});

describe('resolveWorkspaceRulesDir', () => {
  it('returns primary repo .ctxify dir in multi-repo mode', () => {
    const config = {
      mode: 'multi-repo',
      primary_repo: 'api',
      repos: [
        { path: 'api', name: 'api' },
        { path: 'web', name: 'web' },
      ],
    } as CtxConfig;
    const result = resolveWorkspaceRulesDir('/workspace', config, '.ctxify');
    expect(result).toBe('/workspace/api/.ctxify');
  });

  it('falls back to first repo in multi-repo when no primary_repo', () => {
    const config = {
      mode: 'multi-repo',
      repos: [
        { path: 'web', name: 'web' },
        { path: 'api', name: 'api' },
      ],
    } as CtxConfig;
    const result = resolveWorkspaceRulesDir('/workspace', config, '.ctxify');
    expect(result).toBe('/workspace/web/.ctxify');
  });

  it('returns root outputDir in single-repo mode', () => {
    const config = {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'myapp' }],
    } as CtxConfig;
    const result = resolveWorkspaceRulesDir('/workspace', config, '.ctxify');
    expect(result).toBe('/workspace/.ctxify');
  });

  it('returns root outputDir in mono-repo mode', () => {
    const config = {
      mode: 'mono-repo',
      repos: [{ path: 'packages/core', name: 'core' }],
    } as CtxConfig;
    const result = resolveWorkspaceRulesDir('/workspace', config, '.ctxify');
    expect(result).toBe('/workspace/.ctxify');
  });

  it('respects custom outputDir in single-repo mode', () => {
    const config = {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'myapp' }],
    } as CtxConfig;
    const result = resolveWorkspaceRulesDir('/workspace', config, '.context');
    expect(result).toBe('/workspace/.context');
  });
});

describe('findWorkspaceRoot', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-findroot-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns dir when ctx.yaml exists at startDir', () => {
    writeFileSync(join(tmpDir, 'ctx.yaml'), 'mode: single-repo', 'utf-8');
    expect(findWorkspaceRoot(tmpDir)).toBe(tmpDir);
  });

  it('walks up and finds ctx.yaml in parent', () => {
    writeFileSync(join(tmpDir, 'ctx.yaml'), 'mode: multi-repo', 'utf-8');
    const subDir = join(tmpDir, 'api', 'src');
    mkdirSync(subDir, { recursive: true });
    expect(findWorkspaceRoot(subDir)).toBe(tmpDir);
  });

  it('returns null when no ctx.yaml anywhere', () => {
    const subDir = join(tmpDir, 'deep', 'nested');
    mkdirSync(subDir, { recursive: true });
    expect(findWorkspaceRoot(subDir)).toBeNull();
  });

  it('stops at filesystem root without infinite loop', () => {
    // This test simply verifies it terminates and returns null
    expect(findWorkspaceRoot('/')).toBeNull();
  });
});

describe('resolveWorkspaceRootOrThrow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-resolve-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns root with fromParent=false when ctx.yaml at dir', () => {
    writeFileSync(join(tmpDir, 'ctx.yaml'), 'mode: single-repo', 'utf-8');
    const result = resolveWorkspaceRootOrThrow(tmpDir);
    expect(result.root).toBe(tmpDir);
    expect(result.fromParent).toBe(false);
  });

  it('returns root with fromParent=true when ctx.yaml in parent', () => {
    writeFileSync(join(tmpDir, 'ctx.yaml'), 'mode: multi-repo', 'utf-8');
    const subDir = join(tmpDir, 'api');
    mkdirSync(subDir, { recursive: true });
    const result = resolveWorkspaceRootOrThrow(subDir);
    expect(result.root).toBe(tmpDir);
    expect(result.fromParent).toBe(true);
  });

  it('throws ConfigError when no ctx.yaml found', () => {
    const subDir = join(tmpDir, 'empty');
    mkdirSync(subDir, { recursive: true });
    expect(() => resolveWorkspaceRootOrThrow(subDir)).toThrow(ConfigError);
    expect(() => resolveWorkspaceRootOrThrow(subDir)).toThrow('No ctx.yaml found');
  });
});
