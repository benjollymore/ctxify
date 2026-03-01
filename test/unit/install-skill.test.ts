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

  it('installs claude skill — each skill in its own .claude/skills/{name}/ directory', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const relativePath = installSkill(dir, 'claude');

    expect(relativePath).toBe('.claude/skills/ctxify/SKILL.md');
    const skillsDir = join(dir, '.claude', 'skills');
    // Primary skill
    expect(existsSync(join(skillsDir, 'ctxify', 'SKILL.md'))).toBe(true);
    // Each satellite gets its own sibling directory with SKILL.md
    expect(existsSync(join(skillsDir, 'ctxify-reading-context', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-filling-context', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-domain', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-corrections', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-multi-repo', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-startup', 'SKILL.md'))).toBe(true);

    const primaryContent = readFileSync(join(skillsDir, 'ctxify', 'SKILL.md'), 'utf-8');
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
    expect(existsSync(join(rulesDir, 'startup.md'))).toBe(true);

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

  it('claude satellite skills each have name: and description: frontmatter in their own SKILL.md', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    installSkill(dir, 'claude');

    const skillsDir = join(dir, '.claude', 'skills');
    const satelliteDirs = [
      'ctxify-corrections',
      'ctxify-domain',
      'ctxify-filling-context',
      'ctxify-multi-repo',
      'ctxify-reading-context',
      'ctxify-startup',
    ];
    for (const dirName of satelliteDirs) {
      const content = readFileSync(join(skillsDir, dirName, 'SKILL.md'), 'utf-8');
      expect(content.startsWith('---'), `${dirName}/SKILL.md should start with ---`).toBe(true);
      expect(content, `${dirName}/SKILL.md should have name:`).toContain('name: ctxify:');
      expect(content, `${dirName}/SKILL.md should have description:`).toContain('description:');
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
    const satellites = [
      'corrections.md',
      'domain.md',
      'filling-context.md',
      'multi-repo.md',
      'reading-context.md',
      'startup.md',
    ];
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

  it('installs claude skill to global path when scope is global', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const fakeHome = makeTmpDir();
    tmpDirs.push(fakeHome);

    const returnedPath = installSkill(dir, 'claude', 'global', fakeHome);

    expect(returnedPath).toBe('~/.claude/skills/ctxify/SKILL.md');
    const skillsDir = join(fakeHome, '.claude', 'skills');
    expect(existsSync(join(skillsDir, 'ctxify', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-reading-context', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-filling-context', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-domain', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-corrections', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-multi-repo', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDir, 'ctxify-startup', 'SKILL.md'))).toBe(true);
  });

  it('installs codex skill to global path when scope is global', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const fakeHome = makeTmpDir();
    tmpDirs.push(fakeHome);

    const returnedPath = installSkill(dir, 'codex', 'global', fakeHome);

    expect(returnedPath).toBe('~/.codex/AGENTS.md');
    expect(existsSync(join(fakeHome, '.codex', 'AGENTS.md'))).toBe(true);
  });

  it('workspace scope installs to workspaceRoot (unchanged behavior)', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const returnedPath = installSkill(dir, 'claude', 'workspace');

    expect(returnedPath).toBe('.claude/skills/ctxify/SKILL.md');
    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
  });

  it('default scope (no argument) installs to workspace', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    // Call without scope argument - should default to workspace
    const returnedPath = installSkill(dir, 'claude');

    expect(returnedPath).toBe('.claude/skills/ctxify/SKILL.md');
    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
  });

  it('throws when global scope requested for agent without globalDestDir', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    expect(() => installSkill(dir, 'cursor', 'global')).toThrow(/does not support global/);
    expect(() => installSkill(dir, 'copilot', 'global')).toThrow(/does not support global/);
  });

  it('all agents produce primary file with version comment and ctxify heading', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    for (const agent of Object.keys(AGENT_CONFIGS)) {
      const dest = installSkill(dir, agent);
      const content = readFileSync(join(dir, dest), 'utf-8');
      expect(content, `${agent} primary file should have version comment`).toContain(
        '<!-- ctxify v',
      );
      expect(content, `${agent} primary file should have ctxify heading`).toContain('# ctxify');
    }
  });

  it('copilot combined file contains all 7 skill sections', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    installSkill(dir, 'copilot');
    const content = readFileSync(
      join(dir, '.github', 'instructions', 'ctxify.instructions.md'),
      'utf-8',
    );

    expect(content).toContain('# ctxify — Load Context Before Coding');
    expect(content).toContain('ctxify:reading-context');
    expect(content).toContain('ctxify:filling-context');
    expect(content).toContain('ctxify:domain');
    expect(content).toContain('ctxify:corrections');
    expect(content).toContain('ctxify:multi-repo');
    expect(content).toContain('ctxify:startup');
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

  it('returns 8 skill files', () => {
    const files = listSkillSourceFiles();
    expect(files).toHaveLength(8);
  });

  it('remaining files are alphabetically sorted after SKILL.md', () => {
    const files = listSkillSourceFiles();
    const satellites = files.slice(1).map((f) => f.filename);
    const sorted = [...satellites].sort();
    expect(satellites).toEqual(sorted);
  });
});
