import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runUpgrade } from '../../src/cli/commands/upgrade.js';
import { serializeConfig, generateDefaultConfig } from '../../src/core/config.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-upgrade-'));
}

function writeCtxYaml(dir: string, overrides: Record<string, unknown> = {}): void {
  const config = generateDefaultConfig(
    dir,
    [],
    'single-repo',
    undefined,
    undefined,
    undefined,
    undefined,
  );
  const raw = { ...JSON.parse(JSON.stringify(config)), ...overrides };
  writeFileSync(join(dir, 'ctx.yaml'), serializeConfig(raw as typeof config), 'utf-8');
}

describe('runUpgrade', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dry-run with global install_method: shows npm install -g command', async () => {
    writeCtxYaml(tmpDir, { install_method: 'global' });
    const calls: string[][] = [];
    const result = await runUpgrade(tmpDir, {
      dryRun: true,
      execFn: (args) => calls.push(args),
    });

    expect(result.status).toBe('dry-run');
    expect(result.npm_command).toEqual(['install', '-g', '@benjollymore/ctxify@latest']);
    expect(calls).toHaveLength(0); // no exec in dry-run
  });

  it('dry-run with local install_method: shows npm install (no -g)', async () => {
    writeCtxYaml(tmpDir, { install_method: 'local' });
    const result = await runUpgrade(tmpDir, { dryRun: true });

    expect(result.status).toBe('dry-run');
    expect(result.npm_command).toEqual(['install', '@benjollymore/ctxify@latest']);
  });

  it('dry-run with npx install_method: skips npm install', async () => {
    writeCtxYaml(tmpDir, { install_method: 'npx' });
    const result = await runUpgrade(tmpDir, { dryRun: true });

    expect(result.status).toBe('dry-run');
    expect(result.npm_command).toBeNull();
    expect(result.npx_note).toBeDefined();
  });

  it('executes npm install -g for global install_method', async () => {
    writeCtxYaml(tmpDir, { install_method: 'global' });
    const calls: { args: string[]; cwd?: string }[] = [];
    const result = await runUpgrade(tmpDir, {
      execFn: (args, opts) => calls.push({ args, cwd: opts?.cwd }),
    });

    expect(result.status).toBe('upgraded');
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['install', '-g', '@benjollymore/ctxify@latest']);
    expect(calls[0].cwd).toBeUndefined();
  });

  it('executes npm install (no -g) with cwd for local install_method', async () => {
    writeCtxYaml(tmpDir, { install_method: 'local' });
    const calls: { args: string[]; cwd?: string }[] = [];
    await runUpgrade(tmpDir, {
      execFn: (args, opts) => calls.push({ args, cwd: opts?.cwd }),
    });

    expect(calls[0].args).toEqual(['install', '@benjollymore/ctxify@latest']);
    expect(calls[0].cwd).toBe(tmpDir);
  });

  it('skips npm install for npx and sets npx_note in result', async () => {
    writeCtxYaml(tmpDir, { install_method: 'npx' });
    const calls: string[][] = [];
    const result = await runUpgrade(tmpDir, {
      execFn: (args) => calls.push(args),
    });

    expect(result.status).toBe('upgraded');
    expect(calls).toHaveLength(0);
    expect(result.npx_note).toBeDefined();
  });

  it('reinstalls skills listed in ctx.yaml', async () => {
    // Set up the workspace with skills tracked
    writeCtxYaml(tmpDir, {
      install_method: 'global',
      skills: { claude: '.claude/skills/ctxify/SKILL.md' },
    });
    // Pre-create the skill dir so installSkill has somewhere to write
    mkdirSync(join(tmpDir, '.claude', 'skills', 'ctxify'), { recursive: true });

    const calls: string[][] = [];
    const result = await runUpgrade(tmpDir, {
      execFn: (args) => calls.push(args),
    });

    expect(result.status).toBe('upgraded');
    expect(result.skills_reinstalled).toContain('.claude/skills/ctxify/SKILL.md');
    expect(existsSync(join(tmpDir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
  });

  it('proceeds without skills reinstall when no skills in ctx.yaml', async () => {
    writeCtxYaml(tmpDir, { install_method: 'global' });
    const calls: string[][] = [];
    const result = await runUpgrade(tmpDir, {
      execFn: (args) => calls.push(args),
    });

    expect(result.status).toBe('upgraded');
    expect(result.skills_reinstalled).toEqual([]);
  });

  it('proceeds without ctx.yaml (uses default global install, no skills)', async () => {
    const calls: string[][] = [];
    const result = await runUpgrade(tmpDir, {
      execFn: (args) => calls.push(args),
    });

    expect(result.status).toBe('upgraded');
    expect(calls[0]).toEqual(['install', '-g', '@benjollymore/ctxify@latest']);
    expect(result.skills_reinstalled).toEqual([]);
  });

  it('reinstalls skills with correct scope from new SkillEntry format — global scope goes to homeDir', async () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'ctxify-upgrade-home-'));

    writeCtxYaml(tmpDir, {
      install_method: 'global',
      skills: {
        claude: { path: '~/.claude/skills/ctxify/SKILL.md', scope: 'global' },
      },
    });

    const calls: string[][] = [];
    const result = await runUpgrade(tmpDir, {
      execFn: (args) => calls.push(args),
      homeDir: fakeHome,
    });

    expect(result.status).toBe('upgraded');
    expect(result.skills_reinstalled).toContain('~/.claude/skills/ctxify/SKILL.md');
    expect(existsSync(join(fakeHome, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);

    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('backward compat: old string skills format reinstalls to workspace', async () => {
    writeCtxYaml(tmpDir, {
      install_method: 'global',
      skills: { claude: '.claude/skills/ctxify/SKILL.md' },
    });
    mkdirSync(join(tmpDir, '.claude', 'skills', 'ctxify'), { recursive: true });

    const calls: string[][] = [];
    const result = await runUpgrade(tmpDir, {
      execFn: (args) => calls.push(args),
    });

    expect(result.status).toBe('upgraded');
    expect(result.skills_reinstalled).toContain('.claude/skills/ctxify/SKILL.md');
    expect(existsSync(join(tmpDir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
  });
});
