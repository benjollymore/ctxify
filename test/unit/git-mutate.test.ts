import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createBranch, hasChanges, stageAndCommit, getCurrentBranch } from '../../src/utils/git-mutate.js';

describe('git-mutate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-git-mutate-'));
    // Initialize a git repo with an initial commit
    execFileSync('git', ['init'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
    writeFileSync(join(tmpDir, 'README.md'), '# test');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      const branch = await getCurrentBranch(tmpDir);
      // Could be 'main' or 'master' depending on git config
      expect(['main', 'master']).toContain(branch);
    });
  });

  describe('createBranch', () => {
    it('should create and checkout a new branch', async () => {
      await createBranch(tmpDir, 'feature-x');
      const branch = await getCurrentBranch(tmpDir);
      expect(branch).toBe('feature-x');
    });

    it('should throw on duplicate branch name', async () => {
      await createBranch(tmpDir, 'my-branch');
      // Switch back to main/master
      const mainBranch = execFileSync('git', ['branch', '--list', 'main', 'master'], { cwd: tmpDir }).toString().trim();
      const branchToCheckout = mainBranch.includes('main') ? 'main' : 'master';
      execFileSync('git', ['checkout', branchToCheckout], { cwd: tmpDir });

      await expect(createBranch(tmpDir, 'my-branch')).rejects.toThrow();
    });
  });

  describe('hasChanges', () => {
    it('should return false for clean repo', async () => {
      const result = await hasChanges(tmpDir);
      expect(result).toBe(false);
    });

    it('should return true when files are modified', async () => {
      writeFileSync(join(tmpDir, 'README.md'), '# changed');
      const result = await hasChanges(tmpDir);
      expect(result).toBe(true);
    });

    it('should return true when new untracked files exist', async () => {
      writeFileSync(join(tmpDir, 'new-file.txt'), 'hello');
      const result = await hasChanges(tmpDir);
      expect(result).toBe(true);
    });
  });

  describe('stageAndCommit', () => {
    it('should stage all changes and commit', async () => {
      writeFileSync(join(tmpDir, 'new-file.txt'), 'hello');
      const sha = await stageAndCommit(tmpDir, 'add new file');

      expect(sha).toMatch(/^[a-f0-9]{40}$/);
      const clean = await hasChanges(tmpDir);
      expect(clean).toBe(false);
    });

    it('should return commit SHA after committing', async () => {
      writeFileSync(join(tmpDir, 'another.txt'), 'content');
      const sha = await stageAndCommit(tmpDir, 'test commit');

      // Verify SHA matches HEAD
      const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir }).toString().trim();
      expect(sha).toBe(headSha);
    });
  });
});
