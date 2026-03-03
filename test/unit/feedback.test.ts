import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';
import {
  generateCorrectionsTemplate,
  formatCorrectionEntry,
  formatAntiPatternEntry,
  ANTI_PATTERNS_SECTION_HEADER,
} from '../../src/templates/corrections.js';
import { generateRulesTemplate, formatRuleEntry } from '../../src/templates/rules.js';
import { generateRepoTemplate } from '../../src/templates/repo.js';
import { serializeConfig } from '../../src/core/config.js';
import { validateShards } from '../../src/core/validate.js';
import type { CtxConfig } from '../../src/core/config.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-feedback-'));
}

/**
 * Create a single-repo workspace for feedback testing.
 * Uses single-repo mode so corrections go to .ctxify/repos/{name}/
 * and rules go to .ctxify/rules.md (workspace level).
 */
function createSingleRepoWorkspace(dir: string, repoName: string): void {
  const config: CtxConfig = {
    version: '1',
    workspace: dir,
    mode: 'single-repo',
    repos: [{ path: '.', name: repoName }],
    relationships: [],
    options: { outputDir: '.ctxify' },
  };
  writeFileSync(join(dir, 'ctx.yaml'), serializeConfig(config), 'utf-8');

  const ctxDir = join(dir, '.ctxify');
  mkdirSync(ctxDir, { recursive: true });
  writeFileSync(
    join(ctxDir, 'index.md'),
    `---
mode: single-repo
repos:
  - ${repoName}
scanned_at: "${new Date().toISOString()}"
---

# Workspace
`,
    'utf-8',
  );

  const repoDir = join(ctxDir, 'repos', repoName);
  mkdirSync(repoDir, { recursive: true });
  const overview = generateRepoTemplate({
    name: repoName,
    path: '.',
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

/**
 * Create a multi-repo workspace for feedback testing.
 * Corrections go to {repo}/.ctxify/corrections.md (per-repo).
 * Rules go to {primaryRepo}/.ctxify/rules.md (workspace level).
 */
function createMultiRepoWorkspace(dir: string, repoNames: string[]): void {
  const config: CtxConfig = {
    version: '1',
    workspace: dir,
    mode: 'multi-repo',
    repos: repoNames.map((name) => ({ path: name, name })),
    relationships: [],
    options: { outputDir: '.ctxify' },
  };
  writeFileSync(join(dir, 'ctx.yaml'), serializeConfig(config), 'utf-8');

  // Root .ctxify/index.md
  const ctxDir = join(dir, '.ctxify');
  mkdirSync(ctxDir, { recursive: true });
  writeFileSync(
    join(ctxDir, 'index.md'),
    `---
mode: multi-repo
repos:
${repoNames.map((n) => `  - ${n}`).join('\n')}
scanned_at: "${new Date().toISOString()}"
---

# Workspace
`,
    'utf-8',
  );

  // Per-repo .ctxify/ dirs with overview.md
  for (const name of repoNames) {
    const perRepoCtx = join(dir, name, '.ctxify');
    mkdirSync(perRepoCtx, { recursive: true });
    const overview = generateRepoTemplate({
      name,
      path: name,
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
    writeFileSync(join(perRepoCtx, 'overview.md'), overview, 'utf-8');
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

describe('formatAntiPatternEntry', () => {
  it('wraps body with antipattern markers', () => {
    const ts = '2025-06-15T10:30:00.000Z';
    const entry = formatAntiPatternEntry({ body: 'Silent catch swallows errors', timestamp: ts });

    expect(entry).toContain(`<!-- antipattern:${ts} -->`);
    expect(entry).toContain('Silent catch swallows errors');
    expect(entry).toContain('<!-- /antipattern -->');
  });

  it('appends source inline when provided', () => {
    const entry = formatAntiPatternEntry({
      body: 'Missing validation',
      source: 'src/handler.ts:42',
      timestamp: '2025-06-15T10:30:00.000Z',
    });
    expect(entry).toContain('Missing validation — `src/handler.ts:42`');
  });

  it('omits source suffix when not provided', () => {
    const entry = formatAntiPatternEntry({
      body: 'Bad pattern',
      timestamp: '2025-06-15T10:30:00.000Z',
    });
    expect(entry).not.toContain(' — `');
    expect(entry).toContain('Bad pattern');
  });
});

describe('ANTI_PATTERNS_SECTION_HEADER', () => {
  it('contains the # Anti-Patterns heading', () => {
    expect(ANTI_PATTERNS_SECTION_HEADER).toContain('# Anti-Patterns');
  });
});

// ── Rules template tests ─────────────────────────────────────────────────

describe('generateRulesTemplate', () => {
  it('generates rules file with correct frontmatter', () => {
    const output = generateRulesTemplate();
    const fm = parseFrontmatter(output);
    expect(fm).not.toBeNull();
    expect(fm!.type).toBe('rules');
  });

  it('does not include repo in frontmatter', () => {
    const output = generateRulesTemplate();
    const fm = parseFrontmatter(output);
    expect(fm!.repo).toBeUndefined();
  });

  it('contains heading', () => {
    const output = generateRulesTemplate();
    expect(output).toContain('# Rules');
  });
});

describe('formatRuleEntry', () => {
  it('wraps body with rule markers', () => {
    const ts = '2025-06-15T10:30:00.000Z';
    const entry = formatRuleEntry({ body: 'Do not fragment CSS', timestamp: ts });
    expect(entry).toContain(`<!-- rule:${ts} -->`);
    expect(entry).toContain('Do not fragment CSS');
    expect(entry).toContain('<!-- /rule -->');
  });

  it('appends source inline when provided', () => {
    const entry = formatRuleEntry({
      body: 'Never catch-all here',
      source: 'src/payments/handler.ts:42',
      timestamp: '2025-06-15T10:30:00.000Z',
    });
    expect(entry).toContain('Never catch-all here — `src/payments/handler.ts:42`');
  });

  it('omits source suffix when not provided', () => {
    const entry = formatRuleEntry({
      body: 'Always use bun',
      timestamp: '2025-06-15T10:30:00.000Z',
    });
    expect(entry).not.toContain(' — `');
    expect(entry).toContain('Always use bun');
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

  // ── Corrections (per-repo) ──

  it('creates corrections.md with frontmatter and first entry (single-repo)', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

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

  it('creates corrections.md in per-repo .ctxify/ (multi-repo)', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createMultiRepoWorkspace(dir, ['api', 'web']);

    const { parsed } = runFeedback(['api', '--body', 'Auth is per-route'], dir);

    expect(parsed.status).toBe('recorded');
    expect(parsed.repo).toBe('api');

    const correctionsPath = join(dir, 'api', '.ctxify', 'corrections.md');
    expect(existsSync(correctionsPath)).toBe(true);

    const content = readFileSync(correctionsPath, 'utf-8');
    expect(content).toContain('Auth is per-route');
  });

  it('appends to existing corrections.md', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    runFeedback(['api', '--body', 'First correction'], dir);
    const { parsed } = runFeedback(['api', '--body', 'Second correction'], dir);
    expect(parsed.created_file).toBe(false);

    const content = readFileSync(join(dir, '.ctxify', 'repos', 'api', 'corrections.md'), 'utf-8');
    expect(content).toContain('First correction');
    expect(content).toContain('Second correction');

    const openMarkers = content.match(/<!-- correction:/g);
    expect(openMarkers).toHaveLength(2);
  });

  it('rejects unknown repo', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    const stdout = runFeedbackExpectFail(['nonexistent', '--body', 'test'], dir);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('not found');
    expect(parsed.error).toContain('api');
  });

  it('requires --body flag', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

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

  it('requires repo for corrections', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    const stdout = runFeedbackExpectFail(['--type', 'correction', '--body', 'test'], dir);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('Repo argument is required');
  });

  it('produced shards pass validateShards', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    runFeedback(['api', '--body', 'Test correction with balanced markers'], dir);

    const result = validateShards(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('explicit --type correction works same as default', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    const { parsed } = runFeedback(
      ['api', '--type', 'correction', '--body', 'Explicit correction'],
      dir,
    );
    expect(parsed.type).toBe('correction');

    const content = readFileSync(join(dir, '.ctxify', 'repos', 'api', 'corrections.md'), 'utf-8');
    expect(content).toContain('<!-- correction:');
    expect(content).not.toContain('<!-- antipattern:');
  });

  // ── Rules/antipatterns (workspace level) ──

  it('--type antipattern writes to workspace rules.md', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    const { parsed } = runFeedback(
      ['--type', 'antipattern', '--body', 'Silent catch swallows payment errors'],
      dir,
    );

    expect(parsed.status).toBe('recorded');
    expect(parsed.type).toBe('antipattern');

    // Rules go to workspace level .ctxify/rules.md
    const rulesPath = join(dir, '.ctxify', 'rules.md');
    expect(existsSync(rulesPath)).toBe(true);

    const content = readFileSync(rulesPath, 'utf-8');
    expect(content).toContain('# Anti-Patterns');
    expect(content).toContain('<!-- antipattern:');
    expect(content).toContain('<!-- /antipattern -->');
    expect(content).toContain('Silent catch swallows payment errors');
  });

  it('--source is included inline in antipattern entry', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    runFeedback(
      [
        '--type',
        'antipattern',
        '--body',
        'Missing validation',
        '--source',
        'src/payments/handler.ts:42',
      ],
      dir,
    );

    const content = readFileSync(join(dir, '.ctxify', 'rules.md'), 'utf-8');
    expect(content).toContain('Missing validation — `src/payments/handler.ts:42`');
  });

  it('appending a second antipattern does not duplicate # Anti-Patterns header', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    runFeedback(['--type', 'antipattern', '--body', 'First anti-pattern'], dir);
    runFeedback(['--type', 'antipattern', '--body', 'Second anti-pattern'], dir);

    const content = readFileSync(join(dir, '.ctxify', 'rules.md'), 'utf-8');
    const headerCount = (content.match(/# Anti-Patterns/g) || []).length;
    expect(headerCount).toBe(1);
    expect(content).toContain('First anti-pattern');
    expect(content).toContain('Second anti-pattern');
  });

  it('--type rule creates workspace rules.md with rule markers', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    const { parsed } = runFeedback(
      ['--type', 'rule', '--body', 'Do not fragment CSS into modules'],
      dir,
    );

    expect(parsed.status).toBe('recorded');
    expect(parsed.type).toBe('rule');

    const rulesPath = join(dir, '.ctxify', 'rules.md');
    expect(existsSync(rulesPath)).toBe(true);

    const content = readFileSync(rulesPath, 'utf-8');
    const fm = parseFrontmatter(content);
    expect(fm!.type).toBe('rules');
    expect(content).toContain('Do not fragment CSS into modules');
    expect(content).toContain('<!-- rule:');
    expect(content).toContain('<!-- /rule -->');
  });

  it('rules and antipatterns coexist in workspace rules.md', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    runFeedback(['--type', 'rule', '--body', 'Always use bun'], dir);
    runFeedback(['--type', 'antipattern', '--body', 'Silent catch'], dir);

    const content = readFileSync(join(dir, '.ctxify', 'rules.md'), 'utf-8');
    expect(content).toContain('Always use bun');
    expect(content).toContain('Silent catch');
    expect(content).toContain('<!-- rule:');
    expect(content).toContain('<!-- antipattern:');
  });

  it('corrections and rules write to separate files', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    runFeedback(['api', '--body', 'A correction'], dir);
    runFeedback(['--type', 'rule', '--body', 'A rule'], dir);

    const correctionsContent = readFileSync(
      join(dir, '.ctxify', 'repos', 'api', 'corrections.md'),
      'utf-8',
    );
    const rulesContent = readFileSync(join(dir, '.ctxify', 'rules.md'), 'utf-8');
    expect(correctionsContent).toContain('A correction');
    expect(correctionsContent).not.toContain('A rule');
    expect(rulesContent).toContain('A rule');
    expect(rulesContent).not.toContain('A correction');
  });

  it('repo arg is optional for rules', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    // No repo arg — should succeed for rule type
    const { parsed } = runFeedback(['--type', 'rule', '--body', 'No repo needed'], dir);
    expect(parsed.status).toBe('recorded');
    expect(parsed.repo).toBeUndefined();
  });

  it('repo arg is accepted but ignored for rules', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    // Passing repo arg with rule type — should still write to workspace rules.md
    const { parsed } = runFeedback(
      ['api', '--type', 'rule', '--body', 'With repo arg'],
      dir,
    );
    expect(parsed.status).toBe('recorded');

    const content = readFileSync(join(dir, '.ctxify', 'rules.md'), 'utf-8');
    expect(content).toContain('With repo arg');
  });

  it('multi-repo: rules go to primary repo .ctxify/', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createMultiRepoWorkspace(dir, ['api', 'web']);

    runFeedback(['--type', 'rule', '--body', 'Use react query'], dir);

    // Primary repo is first = api
    const rulesPath = join(dir, 'api', '.ctxify', 'rules.md');
    expect(existsSync(rulesPath)).toBe(true);

    const content = readFileSync(rulesPath, 'utf-8');
    expect(content).toContain('Use react query');

    // web repo should NOT have rules.md
    expect(existsSync(join(dir, 'web', '.ctxify', 'rules.md'))).toBe(false);
  });

  it('invalid --type value exits with JSON error', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    const stdout = runFeedbackExpectFail(['api', '--type', 'invalid', '--body', 'test'], dir);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('Invalid --type');
  });

  it('antipattern entries pass validateShards', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createSingleRepoWorkspace(dir, 'api');

    runFeedback(
      ['--type', 'antipattern', '--body', 'Anti-pattern', '--source', 'src/foo.ts:10'],
      dir,
    );

    const result = validateShards(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
