import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';
import { generatePatternsTemplate } from '../../src/templates/patterns.js';
import { serializeConfig } from '../../src/core/config.js';
import type { CtxConfig } from '../../src/core/config.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-patterns-'));
}

const CLI = join(import.meta.dirname, '../../dist/bin/ctxify.js');

function runCli(args: string[], cwd: string): { stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: 'utf-8',
    });
    return { stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function createWorkspace(dir: string, repoNames: string[]): void {
  const config: CtxConfig = {
    version: '1',
    workspace: dir,
    mode: 'multi-repo',
    repos: repoNames.map((name) => ({ path: `./${name}`, name })),
    relationships: [],
    options: { outputDir: '.ctxify' },
  };
  writeFileSync(join(dir, 'ctx.yaml'), serializeConfig(config), 'utf-8');

  for (const name of repoNames) {
    const repoDir = join(dir, '.ctxify', 'repos', name);
    mkdirSync(repoDir, { recursive: true });
  }
}

// ── generatePatternsTemplate ──────────────────────────────────────────────

describe('generatePatternsTemplate', () => {
  it('has correct frontmatter: type=patterns and repo name', () => {
    const output = generatePatternsTemplate({ repo: 'backend' });
    const fm = parseFrontmatter(output);
    expect(fm).not.toBeNull();
    expect(fm!.type).toBe('patterns');
    expect(fm!.repo).toBe('backend');
  });

  it('contains consolidated TODO with end-to-end guidance', () => {
    const output = generatePatternsTemplate({ repo: 'api' });
    expect(output).toContain('# How to Build Features');
    expect(output).toContain('How we build features here');
    expect(output).toContain('end-to-end');
    expect(output).toContain('testing patterns');
    expect(output).toContain('Skip sections');
  });

  it('first TODO asks for end-to-end patterns, not route/controller catalogs', () => {
    const output = generatePatternsTemplate({ repo: 'api' });
    expect(output).toContain('end-to-end');
    expect(output).not.toContain('route/controller structure');
  });

  it('has TODO placeholders for agent to fill', () => {
    const output = generatePatternsTemplate({ repo: 'api' });
    expect(output).toContain('<!-- TODO: Agent');
  });

  it('fits within 40 lines', () => {
    const output = generatePatternsTemplate({ repo: 'api' });
    const lines = output.split('\n').length;
    expect(lines).toBeLessThanOrEqual(40);
  });

  it('repo name appears in frontmatter', () => {
    const output = generatePatternsTemplate({ repo: 'my-service' });
    expect(output).toContain('repo: my-service');
  });
});

// ── CLI: ctxify patterns <repo> ───────────────────────────────────────────

describe('ctxify patterns <repo>', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  it('creates patterns.md and outputs JSON with status=scaffolded', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const { stdout } = runCli(['patterns', 'api', '-d', dir], dir);
    const result = JSON.parse(stdout);

    expect(result.status).toBe('scaffolded');
    expect(result.repo).toBe('api');
    expect(result.file_existed).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'api', 'patterns.md'))).toBe(true);
  });

  it('created patterns.md has correct frontmatter', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    runCli(['patterns', 'api', '-d', dir], dir);

    const content = readFileSync(join(dir, '.ctxify', 'repos', 'api', 'patterns.md'), 'utf-8');
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm!.type).toBe('patterns');
    expect(fm!.repo).toBe('api');
  });

  it('errors with JSON if patterns.md already exists (no --force)', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    runCli(['patterns', 'api', '-d', dir], dir);
    const { stdout } = runCli(['patterns', 'api', '-d', dir], dir);
    const result = JSON.parse(stdout);

    expect(result.error).toMatch(/already exists/);
  });

  it('overwrites existing patterns.md with --force', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const patternsPath = join(dir, '.ctxify', 'repos', 'api', 'patterns.md');
    runCli(['patterns', 'api', '-d', dir], dir);
    writeFileSync(patternsPath, 'old content', 'utf-8');

    const { stdout } = runCli(['patterns', 'api', '--force', '-d', dir], dir);
    const result = JSON.parse(stdout);

    expect(result.status).toBe('scaffolded');
    expect(result.file_existed).toBe(true);
    const content = readFileSync(patternsPath, 'utf-8');
    expect(content).not.toBe('old content');
    expect(content).toContain('# How to Build Features');
  });

  it('errors with JSON for unknown repo', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const { stdout } = runCli(['patterns', 'unknown-repo', '-d', dir], dir);
    const result = JSON.parse(stdout);

    expect(result.error).toMatch(/not found/);
  });

  it('errors with JSON when no ctx.yaml exists', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);

    const { stdout } = runCli(['patterns', 'api', '-d', dir], dir);
    const result = JSON.parse(stdout);

    expect(result.error).toMatch(/ctx\.yaml/);
  });
});
