import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';
import { generateDomainTemplate } from '../../src/templates/domain.js';
import { generateRepoTemplate } from '../../src/templates/repo.js';
import { serializeConfig } from '../../src/core/config.js';
import type { CtxConfig } from '../../src/core/config.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-domain-'));
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

  // Create .ctxify/repos/{name}/ dirs with overview.md
  for (const name of repoNames) {
    const repoDir = join(dir, '.ctxify', 'repos', name);
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

// ── Domain template tests ────────────────────────────────────────────────

describe('generateDomainTemplate', () => {
  it('generates domain file with correct frontmatter', () => {
    const output = generateDomainTemplate({
      repo: 'api',
      domain: 'payments',
      tags: ['billing', 'stripe'],
    });

    const fm = parseFrontmatter(output);
    expect(fm).not.toBeNull();
    expect(fm!.repo).toBe('api');
    expect(fm!.type).toBe('domain');
    expect(fm!.domain).toBe('payments');
    expect(fm!.tags).toEqual(['billing', 'stripe']);
  });

  it('generates domain file with TODO sections', () => {
    const output = generateDomainTemplate({ repo: 'api', domain: 'payments' });

    expect(output).toContain('# payments');
    expect(output).toContain('## Key Files');
    expect(output).toContain('## Patterns');
    expect(output).toContain('## Cross-repo');
    expect(output).toContain('<!-- TODO:');
  });

  it('omits tags from frontmatter when not provided', () => {
    const output = generateDomainTemplate({ repo: 'api', domain: 'payments' });
    const fm = parseFrontmatter(output);
    expect(fm!.tags).toBeUndefined();
  });

  it('omits tags from frontmatter when empty array', () => {
    const output = generateDomainTemplate({ repo: 'api', domain: 'payments', tags: [] });
    const fm = parseFrontmatter(output);
    expect(fm!.tags).toBeUndefined();
  });
});

// ── Domain command tests (using CLI binary) ──────────────────────────────

describe('domain add', () => {
  const tmpDirs: string[] = [];
  const cliBin = join(__dirname, '../../dist/bin/ctxify.js');

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  function runDomain(
    args: string[],
    cwd: string,
  ): { stdout: string; parsed: Record<string, unknown> } {
    const stdout = execFileSync('node', [cliBin, 'domain', ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { stdout, parsed: JSON.parse(stdout) };
  }

  function runDomainExpectFail(args: string[], cwd: string): string {
    try {
      execFileSync('node', [cliBin, 'domain', ...args], {
        cwd,
        encoding: 'utf-8',
        timeout: 10000,
      });
      return '';
    } catch (err) {
      return (err as { stdout?: string }).stdout || '';
    }
  }

  it('scaffolds domain file with correct frontmatter and TODO sections', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const { parsed } = runDomain(['add', 'api', 'payments', '--tags', 'billing,stripe'], dir);

    expect(parsed.status).toBe('registered');
    expect(parsed.repo).toBe('api');
    expect(parsed.domain).toBe('payments');
    expect(parsed.file_existed).toBe(false);

    const domainPath = join(dir, '.ctxify', 'repos', 'api', 'payments.md');
    expect(existsSync(domainPath)).toBe(true);

    const content = readFileSync(domainPath, 'utf-8');
    const fm = parseFrontmatter(content);
    expect(fm!.type).toBe('domain');
    expect(fm!.domain).toBe('payments');
    expect(fm!.tags).toEqual(['billing', 'stripe']);
    expect(content).toContain('<!-- TODO:');
  });

  it('updates overview.md domain-index section', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const { parsed } = runDomain(
      ['add', 'api', 'payments', '--description', 'Payment processing'],
      dir,
    );
    expect(parsed.overview_updated).toBe(true);

    const overview = readFileSync(join(dir, '.ctxify', 'repos', 'api', 'overview.md'), 'utf-8');
    expect(overview).toContain('`payments.md`');
    expect(overview).toContain('Payment processing');
  });

  it('is idempotent — does not clobber existing domain file', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    // First add
    runDomain(['add', 'api', 'payments'], dir);

    // Modify the domain file to simulate agent work
    const domainPath = join(dir, '.ctxify', 'repos', 'api', 'payments.md');
    const original = readFileSync(domainPath, 'utf-8');
    writeFileSync(domainPath, original + '\nAgent-written content here\n', 'utf-8');

    // Second add
    const { parsed } = runDomain(['add', 'api', 'payments'], dir);
    expect(parsed.file_existed).toBe(true);

    // Content should be preserved
    const content = readFileSync(domainPath, 'utf-8');
    expect(content).toContain('Agent-written content here');
  });

  it('inserts overview entry even when domain file pre-exists', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    // Create domain file manually (without overview entry)
    const repoDir = join(dir, '.ctxify', 'repos', 'api');
    const domainContent = generateDomainTemplate({ repo: 'api', domain: 'payments' });
    writeFileSync(join(repoDir, 'payments.md'), domainContent, 'utf-8');

    // Run domain add — should still update overview
    const { parsed } = runDomain(['add', 'api', 'payments', '--description', 'Payment flows'], dir);
    expect(parsed.file_existed).toBe(true);
    expect(parsed.overview_updated).toBe(true);

    const overview = readFileSync(join(repoDir, 'overview.md'), 'utf-8');
    expect(overview).toContain('`payments.md`');
  });

  it('rejects unknown repo', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const stdout = runDomainExpectFail(['add', 'nonexistent', 'payments'], dir);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('not found');
  });

  it('validates domain name format — lowercase alphanumeric + hyphens', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const stdout = runDomainExpectFail(['add', 'api', 'Invalid_Name'], dir);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('Invalid domain name');
  });

  it('accepts valid hyphenated domain name', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const { parsed } = runDomain(['add', 'api', 'user-auth'], dir);
    expect(parsed.status).toBe('registered');
    expect(parsed.domain).toBe('user-auth');
  });

  it('does not duplicate overview entry on repeated add', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    runDomain(['add', 'api', 'payments', '--description', 'Payment flows'], dir);
    const { parsed } = runDomain(['add', 'api', 'payments', '--description', 'Payment flows'], dir);
    expect(parsed.overview_updated).toBe(false);

    const overview = readFileSync(join(dir, '.ctxify', 'repos', 'api', 'overview.md'), 'utf-8');
    const matches = overview.match(/`payments\.md`/g);
    expect(matches).toHaveLength(1);
  });
});

describe('domain list', () => {
  const tmpDirs: string[] = [];
  const cliBin = join(__dirname, '../../dist/bin/ctxify.js');

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  function runDomain(args: string[], cwd: string): Record<string, unknown> {
    const stdout = execFileSync('node', [cliBin, 'domain', ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return JSON.parse(stdout);
  }

  it('returns domains grouped by repo', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api', 'web']);

    // Create domain files
    const apiDir = join(dir, '.ctxify', 'repos', 'api');
    writeFileSync(
      join(apiDir, 'payments.md'),
      generateDomainTemplate({ repo: 'api', domain: 'payments', tags: ['billing'] }),
      'utf-8',
    );
    writeFileSync(
      join(apiDir, 'auth.md'),
      generateDomainTemplate({ repo: 'api', domain: 'auth', tags: ['security'] }),
      'utf-8',
    );

    const result = runDomain(['list'], dir);
    const repos = result.repos as Record<string, Array<{ domain: string; tags: string[] }>>;

    expect(repos.api).toHaveLength(2);
    expect(repos.api.map((d) => d.domain).sort()).toEqual(['auth', 'payments']);
    expect(repos.web).toHaveLength(0);
  });

  it('filters by --repo', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api', 'web']);

    const apiDir = join(dir, '.ctxify', 'repos', 'api');
    writeFileSync(
      join(apiDir, 'payments.md'),
      generateDomainTemplate({ repo: 'api', domain: 'payments' }),
      'utf-8',
    );

    const result = runDomain(['list', '--repo', 'api'], dir);
    const repos = result.repos as Record<string, Array<{ domain: string }>>;

    expect(Object.keys(repos)).toEqual(['api']);
    expect(repos.api).toHaveLength(1);
  });

  it('returns empty when no domains exist', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createWorkspace(dir, ['api']);

    const result = runDomain(['list'], dir);
    const repos = result.repos as Record<string, unknown[]>;
    expect(repos.api).toHaveLength(0);
  });
});
