import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSkill, getSkillSourcePath } from '../../src/cli/install-skill.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-skill-'));
}

describe('installSkill', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  it('copies SKILL.md to .claude/skills/ctxify/', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'claude');

    expect(relativePath).toBe('.claude/skills/ctxify/SKILL.md');
    const destPath = join(dir, relativePath);
    expect(existsSync(destPath)).toBe(true);

    // Verify source content is present in the installed file
    const sourceContent = readFileSync(getSkillSourcePath(), 'utf-8');
    const installedContent = readFileSync(destPath, 'utf-8');
    expect(installedContent).toContain(sourceContent);
  });

  it('prepends version comment as first line', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    installSkill(dir, 'claude');

    const destPath = join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md');
    const content = readFileSync(destPath, 'utf-8');
    const firstLine = content.split('\n')[0];
    expect(firstLine).toMatch(/^<!-- ctxify v\d+\.\d+\.\d+ — do not edit manually, managed by ctxify init -->$/);
  });

  it('creates intermediate directories', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    // Ensure no .claude directory exists beforehand
    expect(existsSync(join(dir, '.claude'))).toBe(false);

    installSkill(dir, 'claude');

    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify'))).toBe(true);
    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
  });

  it('overwrites existing skill file', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    // Pre-create with old content
    const skillDir = join(dir, '.claude', 'skills', 'ctxify');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), 'old content', 'utf-8');

    installSkill(dir, 'claude');

    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
    expect(content).not.toBe('old content');
    expect(content).toContain('<!-- ctxify v');
    expect(content).toContain('# ctxify');
  });

  it('throws for unsupported agent', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    expect(() => installSkill(dir, 'unsupported-agent')).toThrow('Unsupported agent: unsupported-agent');
  });
});

describe('getSkillSourcePath', () => {
  it('resolves to an existing SKILL.md', () => {
    const sourcePath = getSkillSourcePath();
    expect(existsSync(sourcePath)).toBe(true);
    expect(sourcePath).toMatch(/SKILL\.md$/);
  });

  it('points to a file containing the skill content', () => {
    const sourcePath = getSkillSourcePath();
    const content = readFileSync(sourcePath, 'utf-8');
    expect(content).toContain('# ctxify');
    expect(content).toContain('Agent Playbook');
  });
});
