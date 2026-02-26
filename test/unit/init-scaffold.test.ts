import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldWorkspace } from '../../src/cli/commands/init.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-scaffold-'));
}

function createPackageJson(dir: string, name: string, extras: Record<string, unknown> = {}): void {
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...extras }, null, 2),
    'utf-8',
  );
}

describe('scaffoldWorkspace', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  it('scaffolds single-repo workspace', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app', { dependencies: { express: '^4.0.0' } });

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.status).toBe('initialized');
    expect(result.mode).toBe('single-repo');
    expect(existsSync(join(dir, 'ctx.yaml'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'index.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'my-app.md'))).toBe(true);
  });

  it('scaffolds multi-repo workspace', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const apiDir = join(dir, 'api');
    const webDir = join(dir, 'web');
    mkdirSync(apiDir);
    mkdirSync(webDir);
    createPackageJson(apiDir, 'api');
    createPackageJson(webDir, 'web');

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'multi-repo',
      repos: [{ path: 'api', name: 'api' }, { path: 'web', name: 'web' }],
    });

    expect(result.status).toBe('initialized');
    expect(result.mode).toBe('multi-repo');
    expect(result.repos).toEqual(['api', 'web']);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'api.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'web.md'))).toBe(true);
  });

  it('does not include skill_installed when no agent specified', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.skill_installed).toBeUndefined();
  });

  it('writes all expected shard directories', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(existsSync(join(dir, '.ctxify', 'endpoints', 'my-app.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'schemas', 'my-app.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'types', 'shared.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'env', 'all.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'topology', 'graph.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'questions', 'pending.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', '_analysis.md'))).toBe(true);
  });

  it('ensures .ctxify/ is in .gitignore', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    const gitignorePath = join(dir, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.ctxify/');
  });

  it('returns config path as absolute path', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.config).toBe(join(dir, 'ctx.yaml'));
  });
});
