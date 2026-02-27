import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { generateDefaultConfig, serializeConfig, loadConfig } from '../../src/core/config.js';
import {
  createBranch,
  getCurrentBranch,
  hasChanges,
  stageAndCommit,
} from '../../src/utils/git-mutate.js';

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(join(dir, 'README.md'), '# test');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir });
}

describe('integration: git coordination across multi-repo workspace', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-git-cmds-'));
    workspaceDir = join(tmpDir, 'workspace');
    mkdirSync(workspaceDir, { recursive: true });

    // Create two git repos
    initGitRepo(join(workspaceDir, 'repo-a'));
    initGitRepo(join(workspaceDir, 'repo-b'));

    // Write multi-repo ctx.yaml
    const config = generateDefaultConfig(
      workspaceDir,
      [
        { path: 'repo-a', name: 'repo-a' },
        { path: 'repo-b', name: 'repo-b' },
      ],
      'multi-repo',
    );
    writeFileSync(join(workspaceDir, 'ctx.yaml'), serializeConfig(config), 'utf-8');
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create branch in all repos', async () => {
    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    expect(config.mode).toBe('multi-repo');

    for (const entry of config.repos) {
      const repoPath = join(workspaceDir, entry.path);
      await createBranch(repoPath, 'feature-test');
      const branch = await getCurrentBranch(repoPath);
      expect(branch).toBe('feature-test');
    }
  });

  it('should commit only in dirty repos', async () => {
    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));

    // Only dirty repo-a
    writeFileSync(join(workspaceDir, 'repo-a', 'new-file.txt'), 'hello');

    const results: Array<{ repo: string; committed: boolean }> = [];

    for (const entry of config.repos) {
      const repoPath = join(workspaceDir, entry.path);
      const dirty = await hasChanges(repoPath);
      if (dirty) {
        await stageAndCommit(repoPath, 'test commit');
        results.push({ repo: entry.name, committed: true });
      } else {
        results.push({ repo: entry.name, committed: false });
      }
    }

    expect(results.find((r) => r.repo === 'repo-a')?.committed).toBe(true);
    expect(results.find((r) => r.repo === 'repo-b')?.committed).toBe(false);
  });
});

describe('integration: mode guard errors', () => {
  let tmpDir: string;

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect single-repo mode from config', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-mode-guard-'));
    const config = generateDefaultConfig(tmpDir, [{ path: '.', name: 'myrepo' }], 'single-repo');
    writeFileSync(join(tmpDir, 'ctx.yaml'), serializeConfig(config), 'utf-8');

    const loaded = loadConfig(join(tmpDir, 'ctx.yaml'));
    expect(loaded.mode).toBe('single-repo');
    // branch/commit commands would reject this mode
    expect(loaded.mode).not.toBe('multi-repo');
  });
});
