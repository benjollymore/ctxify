import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldWorkspace, detectInstallMethod } from '../../src/cli/commands/init.js';
import { loadConfig } from '../../src/core/config.js';

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
    expect(existsSync(join(dir, '.ctxify', 'repos', 'my-app', 'overview.md'))).toBe(true);
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
      repos: [
        { path: 'api', name: 'api' },
        { path: 'web', name: 'web' },
      ],
    });

    expect(result.status).toBe('initialized');
    expect(result.mode).toBe('multi-repo');
    expect(result.repos).toEqual(['api', 'web']);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'api', 'overview.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'web', 'overview.md'))).toBe(true);
  });

  it('does not include skills_installed when no agents specified', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.skills_installed).toBeUndefined();
  });

  it('installs skills for multiple agents', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
      agents: ['claude', 'cursor', 'codex'],
    });

    expect(result.skills_installed).toEqual([
      '.claude/skills/ctxify/SKILL.md',
      '.cursor/rules/ctxify.md',
      'AGENTS.md',
    ]);
    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.cursor', 'rules', 'ctxify.md'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);

    // Verify content
    const claudeContent = readFileSync(
      join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'),
      'utf-8',
    );
    expect(claudeContent).toContain('name: ctxify');
    const codexContent = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
    // No YAML frontmatter wrapping — file starts with version comment, not ---
    expect(codexContent.startsWith('---')).toBe(false);
  });

  it('only creates repos/{name}/overview.md (no old shard dirs)', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    // New structure
    expect(existsSync(join(dir, '.ctxify', 'repos', 'my-app', 'overview.md'))).toBe(true);

    // Old structure should NOT exist
    expect(existsSync(join(dir, '.ctxify', 'endpoints'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'schemas'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'types'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'env'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'topology'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'questions'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', '_analysis.md'))).toBe(false);
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

  it('persists install_method in ctx.yaml when provided', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
      install_method: 'global',
    });

    const config = loadConfig(join(dir, 'ctx.yaml'));
    expect(config.install_method).toBe('global');
  });

  it('persists skills map in ctx.yaml when agents installed', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
      agents: ['claude', 'codex'],
    });

    const config = loadConfig(join(dir, 'ctx.yaml'));
    expect(config.skills).toBeDefined();
    expect(config.skills!['claude']).toBe('.claude/skills/ctxify/SKILL.md');
    expect(config.skills!['codex']).toBe('AGENTS.md');
  });

  it('omits skills from ctx.yaml when no agents installed', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    const config = loadConfig(join(dir, 'ctx.yaml'));
    expect(config.skills).toBeUndefined();
  });
});

describe('detectInstallMethod', () => {
  it('detects npx from _npx in argv1', () => {
    expect(detectInstallMethod('/usr/local/lib/node_modules/.bin/../_npx/ctxify')).toBe('npx');
  });

  it('detects local from node_modules in argv1', () => {
    expect(detectInstallMethod('/home/user/project/node_modules/.bin/ctxify')).toBe('local');
  });

  it('detects global otherwise', () => {
    expect(detectInstallMethod('/usr/local/bin/ctxify')).toBe('global');
  });

  it('detects global for homebrew-style path', () => {
    expect(detectInstallMethod('/opt/homebrew/bin/ctxify')).toBe('global');
  });
});
