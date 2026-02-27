import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSkill, getPlaybookSourcePath, AGENT_CONFIGS } from '../../src/cli/install-skill.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-skill-'));
}

describe('installSkill', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  it('installs claude skill to .claude/skills/ctxify/', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'claude');

    expect(relativePath).toBe('.claude/skills/ctxify/SKILL.md');
    const destPath = join(dir, relativePath);
    expect(existsSync(destPath)).toBe(true);

    const installedContent = readFileSync(destPath, 'utf-8');
    expect(installedContent).toContain('# ctxify');
    expect(installedContent).toContain('<!-- ctxify v');
  });

  it('installs copilot instructions to .github/instructions/', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'copilot');

    expect(relativePath).toBe('.github/instructions/ctxify.instructions.md');
    const destPath = join(dir, relativePath);
    expect(existsSync(destPath)).toBe(true);

    const installedContent = readFileSync(destPath, 'utf-8');
    expect(installedContent).toContain('# ctxify');
    expect(installedContent).toContain('applyTo: "**"');
  });

  it('installs cursor rules to .cursor/rules/', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'cursor');

    expect(relativePath).toBe('.cursor/rules/ctxify.md');
    const destPath = join(dir, relativePath);
    expect(existsSync(destPath)).toBe(true);

    const installedContent = readFileSync(destPath, 'utf-8');
    expect(installedContent).toContain('# ctxify');
    expect(installedContent).toContain('alwaysApply: true');
  });

  it('installs codex to AGENTS.md without frontmatter', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'codex');

    expect(relativePath).toBe('AGENTS.md');
    const destPath = join(dir, relativePath);
    expect(existsSync(destPath)).toBe(true);

    const installedContent = readFileSync(destPath, 'utf-8');
    expect(installedContent).toContain('# ctxify');
    // No YAML frontmatter wrapping — file starts with version comment, not ---
    expect(installedContent.startsWith('---')).toBe(false);
  });

  it('claude skill has frontmatter starting at line 1', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    installSkill(dir, 'claude');

    const destPath = join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md');
    const content = readFileSync(destPath, 'utf-8');
    expect(content.startsWith('---')).toBe(true);
    expect(content).toMatch(
      /---\n<!-- ctxify v\d+\.\d+\.\d+ — do not edit manually, managed by ctxify init -->/,
    );
  });

  it('creates intermediate directories', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    expect(existsSync(join(dir, '.claude'))).toBe(false);

    installSkill(dir, 'claude');

    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify'))).toBe(true);
    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
  });

  it('overwrites existing skill file', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

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

    expect(() => installSkill(dir, 'unsupported-agent')).toThrow(
      'Unsupported agent: unsupported-agent',
    );
  });

  it('all agents produce content with version comment', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    for (const agent of Object.keys(AGENT_CONFIGS)) {
      const dest = installSkill(dir, agent);
      const content = readFileSync(join(dir, dest), 'utf-8');
      expect(content).toContain('<!-- ctxify v');
      expect(content).toContain('# ctxify');
    }
  });
});

describe('getPlaybookSourcePath', () => {
  it('resolves to an existing PLAYBOOK.md', () => {
    const sourcePath = getPlaybookSourcePath();
    expect(existsSync(sourcePath)).toBe(true);
    expect(sourcePath).toMatch(/PLAYBOOK\.md$/);
  });

  it('points to a file containing the playbook content', () => {
    const sourcePath = getPlaybookSourcePath();
    const content = readFileSync(sourcePath, 'utf-8');
    expect(content).toContain('# ctxify');
    expect(content).toContain('Agent Playbook');
  });
});
