import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';
import {
  generateCorrectionsTemplate,
  formatCorrectionEntry,
} from '../../src/templates/corrections.js';
import { generateRepoTemplate } from '../../src/templates/repo.js';
import { serializeConfig } from '../../src/core/config.js';
import { validateShards } from '../../src/core/validate.js';
import type { CtxConfig } from '../../src/core/config.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-feedback-'));
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

  // Create .ctxify with index.md and repos/{name}/overview.md
  const ctxDir = join(dir, '.ctxify');
  mkdirSync(ctxDir, { recursive: true });
  writeFileSync(
    join(ctxDir, 'index.md'),
    `---
ctxify: "2.0"
mode: multi-repo
repos:
${repoNames.map((n) => `  - ${n}`).join('\n')}
scanned_at: "${new Date().toISOString()}"
---

# Workspace
`,
    'utf-8',
  );

  for (const name of repoNames) {
    const repoDir = join(ctxDir, 'repos', name);
    mkdirSync(repoDir, { recursive: true });
    const overview = generateRepoTemplate({
      name,
      path: `./${name}`,
      language: 'typescript',
      framework: '',
      description: '',
      dependencies: {},
      devDependencies: {},
      scripts: {},
      manifestType: 'package.json',
      entryPoints: [],
      keyDirs: [],
      fileCount: 0,
    });
    writeFileSync(join(repoDir, 'overview.md'), overview, 'utf-8');
  }
}

// ── Template tests ──────────────────────────────────────────────────────

describe('generateCorrectionsTemplate', () => {
  it('generates corrections file with correct frontmatter', () => {
    const output = generateCorrectionsTemplate({ repo: 'api' });

    const fm = parseFrontmatter(output);
    expect(fm).not.toBeNull();
    expect(fm!.repo).toBe('api');
    expect(fm!.type).toBe('corrections');
  });

  it('contains heading', () => {
    const output = generateCorrectionsTemplate({ repo: 'api' });
    expect(output).toContain('# Corrections');
  });
});

describe('formatCorrectionEntry', () => {
  it('wraps body with correction markers', () => {
    const ts = '2025-06-15T10:30:00.000Z';
    const entry = formatCorrectionEntry({ body: 'Auth middleware is not global', timestamp: ts });

    expect(entry).toContain(`<!-- correction:${ts} -->`);
    expect(entry).toContain('Auth middleware is not global');
    expect(entry).toContain('<!-- /correction -->');
  });

  it('preserves multiline body', () => {
    const body =
      '## Wrong assumption\n\nThe API uses JWT, not session cookies.\nSee `src/auth.ts:42`.';
    const entry = formatCorrectionEntry({ body, timestamp: '2025-06-15T10:30:00.000Z' });

    expect(entry).toContain('## Wrong assumption');
    expect(entry).toContain('The API uses JWT, not session cookies.');
    expect(entry).toContain('See `src/auth.ts:42`.');
  });
});

// ── Command tests (using built CLI binary) ──────────────────────────────

describe('feedback command', () => {
  const tmpDirs: string[] = [];
  const cliBin = join(__dirname, '../../dist/bin/ctxify.js');

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  function runFeedback(
    args: string[],
    cwd: string,
  ): { stdout: string; parsed: Record<string, unknown> } {
    const stdout = execFileSync('node', [cliBin, 'feedback', ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { stdout, parsed: JSON.parse(stdout) };
  }

  function runFeedbackExpectFail(args: string[], cwd: string): string {
    try {
      execFileSync('node', [cliBin, 'feedback', ...args], {
        cwd,
        encoding: 'utf-8',
        timeout: 10000,
      });
      return '';
    } catch (err) {
      return (err as { stdout?: string }).stdout || '';
    }
  }

  it('creates corrections.md with frontmatter and first entry', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const { parsed } = runFeedback(['api', '--body', 'Auth middleware is not global'], dir);

    expect(parsed.status).toBe('recorded');
    expect(parsed.repo).toBe('api');
    expect(parsed.created_file).toBe(true);
    expect(parsed.timestamp).toBeDefined();

    const correctionsPath = join(dir, '.ctxify', 'repos', 'api', 'corrections.md');
    expect(existsSync(correctionsPath)).toBe(true);

    const content = readFileSync(correctionsPath, 'utf-8');
    const fm = parseFrontmatter(content);
    expect(fm!.repo).toBe('api');
    expect(fm!.type).toBe('corrections');
    expect(content).toContain('Auth middleware is not global');
    expect(content).toContain('<!-- correction:');
    expect(content).toContain('<!-- /correction -->');
  });

  it('appends to existing corrections.md', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    // First correction
    runFeedback(['api', '--body', 'First correction'], dir);

    // Second correction
    const { parsed } = runFeedback(['api', '--body', 'Second correction'], dir);
    expect(parsed.created_file).toBe(false);

    const content = readFileSync(join(dir, '.ctxify', 'repos', 'api', 'corrections.md'), 'utf-8');
    expect(content).toContain('First correction');
    expect(content).toContain('Second correction');

    // Should have two correction markers
    const openMarkers = content.match(/<!-- correction:/g);
    expect(openMarkers).toHaveLength(2);
  });

  it('rejects unknown repo', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const stdout = runFeedbackExpectFail(['nonexistent', '--body', 'test'], dir);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('not found');
    expect(parsed.error).toContain('api');
  });

  it('requires --body flag', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    try {
      execFileSync('node', [cliBin, 'feedback', 'api'], {
        cwd: dir,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
      });
      expect.fail('should have thrown');
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr || '';
      expect(stderr).toContain('--body');
    }
  });

  it('produced shards pass validateShards', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    runFeedback(['api', '--body', 'Test correction with balanced markers'], dir);

    const result = validateShards(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
