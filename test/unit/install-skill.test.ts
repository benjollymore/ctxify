import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  installSkill,
  getSkillSourceDir,
  listSkillSourceFiles,
  AGENT_CONFIGS,
} from '../../src/cli/install-skill.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-skill-'));
}

describe('installSkill', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  it('installs claude skill — SKILL.md + satellite files in .claude/skills/ctxify/', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'claude');

    expect(relativePath).toBe('.claude/skills/ctxify/SKILL.md');
    const skillDir = join(dir, '.claude', 'skills', 'ctxify');
    expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillDir, 'reading-context.md'))).toBe(true);
    expect(existsSync(join(skillDir, 'filling-context.md'))).toBe(true);
    expect(existsSync(join(skillDir, 'domain.md'))).toBe(true);
    expect(existsSync(join(skillDir, 'corrections.md'))).toBe(true);
    expect(existsSync(join(skillDir, 'multi-repo.md'))).toBe(true);

    const primaryContent = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
    expect(primaryContent).toContain('# ctxify');
    expect(primaryContent).toContain('<!-- ctxify v');
  });

  it('installs copilot — single combined file at .github/instructions/ctxify.instructions.md', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'copilot');

    expect(relativePath).toBe('.github/instructions/ctxify.instructions.md');
    const destPath = join(dir, relativePath);
    expect(existsSync(destPath)).toBe(true);

    const content = readFileSync(destPath, 'utf-8');
    expect(content).toContain('# ctxify');
    expect(content).toContain('applyTo: "**"');
    expect(content).toContain('<!-- ctxify v');
  });

  it('installs cursor — ctxify.md + satellite files in .cursor/rules/', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'cursor');

    expect(relativePath).toBe('.cursor/rules/ctxify.md');
    const rulesDir = join(dir, '.cursor', 'rules');
    expect(existsSync(join(rulesDir, 'ctxify.md'))).toBe(true);
    expect(existsSync(join(rulesDir, 'reading-context.md'))).toBe(true);
    expect(existsSync(join(rulesDir, 'filling-context.md'))).toBe(true);
    expect(existsSync(join(rulesDir, 'domain.md'))).toBe(true);
    expect(existsSync(join(rulesDir, 'corrections.md'))).toBe(true);
    expect(existsSync(join(rulesDir, 'multi-repo.md'))).toBe(true);

    const primaryContent = readFileSync(join(rulesDir, 'ctxify.md'), 'utf-8');
    expect(primaryContent).toContain('# ctxify');
    expect(primaryContent).toContain('alwaysApply: true');
  });

  it('installs codex — single combined AGENTS.md without agent frontmatter', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'codex');

    expect(relativePath).toBe('AGENTS.md');
    const destPath = join(dir, relativePath);
    expect(existsSync(destPath)).toBe(true);

    const content = readFileSync(destPath, 'utf-8');
    expect(content).toContain('# ctxify');
    // No YAML frontmatter wrapping — file starts with version comment, not ---
    expect(content.startsWith('---')).toBe(false);
  });

  it('claude SKILL.md has name: and description: frontmatter', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    installSkill(dir, 'claude');

    const destPath = join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md');
    const content = readFileSync(destPath, 'utf-8');
    expect(content.startsWith('---')).toBe(true);
    expect(content).toContain('name: ctxify');
    expect(content).toContain('description:');
    expect(content).toContain('<!-- ctxify v');
  });

  it('claude satellite files each have name: and description: frontmatter', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    installSkill(dir, 'claude');

    const skillDir = join(dir, '.claude', 'skills', 'ctxify');
    const satellites = ['reading-context.md', 'filling-context.md', 'domain.md', 'corrections.md', 'multi-repo.md'];
    for (const filename of satellites) {
      const content = readFileSync(join(skillDir, filename), 'utf-8');
      expect(content.startsWith('---'), `${filename} should start with ---`).toBe(true);
      expect(content, `${filename} should have name:`).toContain('name: ctxify:');
      expect(content, `${filename} should have description:`).toContain('description:');
    }
  });

  it('cursor primary skill (ctxify.md) has alwaysApply: true', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    installSkill(dir, 'cursor');

    const content = readFileSync(join(dir, '.cursor', 'rules', 'ctxify.md'), 'utf-8');
    expect(content).toContain('alwaysApply: true');
  });

  it('cursor satellite skills have alwaysApply: false', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    installSkill(dir, 'cursor');

    const rulesDir = join(dir, '.cursor', 'rules');
    const satellites = ['reading-context.md', 'filling-context.md', 'domain.md', 'corrections.md', 'multi-repo.md'];
    for (const filename of satellites) {
      const content = readFileSync(join(rulesDir, filename), 'utf-8');
      expect(content, `${filename} should have alwaysApply: false`).toContain('alwaysApply: false');
    }
  });

  it('creates intermediate directories', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    expect(existsSync(join(dir, '.claude'))).toBe(false);

    installSkill(dir, 'claude');

    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify'))).toBe(true);
    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
  });

  it('reinstall overwrites all existing skill files', () => {
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

  it('all agents produce primary file with version comment and ctxify heading', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    for (const agent of Object.keys(AGENT_CONFIGS)) {
      const dest = installSkill(dir, agent);
      const content = readFileSync(join(dir, dest), 'utf-8');
      expect(content, `${agent} primary file should have version comment`).toContain('<!-- ctxify v');
      expect(content, `${agent} primary file should have ctxify heading`).toContain('# ctxify');
    }
  });

  it('copilot combined file contains all 6 skill sections', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    installSkill(dir, 'copilot');
    const content = readFileSync(join(dir, '.github', 'instructions', 'ctxify.instructions.md'), 'utf-8');

    expect(content).toContain('# ctxify — Orientation');
    expect(content).toContain('ctxify:reading-context');
    expect(content).toContain('ctxify:filling-context');
    expect(content).toContain('ctxify:domain');
    expect(content).toContain('ctxify:corrections');
    expect(content).toContain('ctxify:multi-repo');
  });
});

describe('getSkillSourceDir', () => {
  it('resolves to an existing skills/ directory', () => {
    const skillDir = getSkillSourceDir();
    expect(existsSync(skillDir)).toBe(true);
    expect(skillDir).toMatch(/skills$/);
  });
});

describe('listSkillSourceFiles', () => {
  it('returns an array with filename and sourcePath', () => {
    const files = listSkillSourceFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const { filename, sourcePath } of files) {
      expect(filename).toMatch(/\.md$/);
      expect(existsSync(sourcePath)).toBe(true);
    }
  });

  it('SKILL.md is first in the list', () => {
    const files = listSkillSourceFiles();
    expect(files[0].filename).toBe('SKILL.md');
  });

  it('returns 6 skill files', () => {
    const files = listSkillSourceFiles();
    expect(files).toHaveLength(6);
  });

  it('remaining files are alphabetically sorted after SKILL.md', () => {
    const files = listSkillSourceFiles();
    const satellites = files.slice(1).map((f) => f.filename);
    const sorted = [...satellites].sort();
    expect(satellites).toEqual(sorted);
  });
});
