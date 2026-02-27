import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { autoDetectMode } from '../../src/core/detect.js';

describe('autoDetectMode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-detect-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects single-repo when directory has one git repo', () => {
    execFileSync('git', ['init'], { cwd: tmpDir });

    const result = autoDetectMode(tmpDir);

    expect(result.mode).toBe('single-repo');
  });

  it('detects multi-repo when 2+ git subdirs exist', () => {
    const repoA = join(tmpDir, 'repo-a');
    const repoB = join(tmpDir, 'repo-b');
    mkdirSync(repoA);
    mkdirSync(repoB);
    execFileSync('git', ['init'], { cwd: repoA });
    execFileSync('git', ['init'], { cwd: repoB });

    const result = autoDetectMode(tmpDir);

    expect(result.mode).toBe('multi-repo');
  });

  it('detects mono-repo when package.json has workspaces', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'mono', workspaces: ['packages/*'] }),
      'utf-8',
    );
    // Create a workspace package
    const pkgDir = join(tmpDir, 'packages', 'lib-a');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@mono/lib-a' }), 'utf-8');

    const result = autoDetectMode(tmpDir);

    expect(result.mode).toBe('mono-repo');
    expect(result.manager).toBeDefined();
  });
});
