import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';
import { generateIndexTemplate, type RepoTemplateData } from '../../src/templates/index-md.js';
import { generateRepoTemplate } from '../../src/templates/repo.js';

// ── Test fixtures ────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<RepoTemplateData> = {}): RepoTemplateData {
  return {
    name: 'api-server',
    path: '/workspace/api-server',
    language: 'typescript',
    framework: 'hono',
    description: 'The main API',
    dependencies: { hono: '4.0.0', zod: '3.22.0' },
    devDependencies: { typescript: '5.6.0', vitest: '2.1.0' },
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      test: 'vitest run',
      lint: 'eslint .',
      'pre-commit': 'lint-staged',
      'docker:up': 'docker compose up',
      'migrate:run': 'prisma migrate deploy',
    },
    manifestType: 'package.json',
    entryPoints: ['src/index.ts', 'bin/cli.ts'],
    keyDirs: [
      'src',
      'src/routes',
      'src/middleware',
      'src/services/dropoff',
      'patches/legacy',
      'tests/unit',
    ],
    fileCount: 42,
    ...overrides,
  };
}

function makeRepoB(): RepoTemplateData {
  return {
    name: 'web-ui',
    path: '/workspace/web-ui',
    language: 'typescript',
    framework: 'react',
    description: 'Frontend app',
    dependencies: { react: '18.3.0', 'react-dom': '18.3.0' },
    devDependencies: { typescript: '5.6.0', vite: '5.4.0' },
    scripts: { dev: 'vite', build: 'vite build' },
    manifestType: 'package.json',
    entryPoints: ['src/main.tsx'],
    keyDirs: ['src', 'src/components'],
    fileCount: 120,
  };
}

// ── Index template ───────────────────────────────────────────────────────

describe('index template', () => {
  const repos = [makeRepo(), makeRepoB()];
  const output = generateIndexTemplate(repos, '/workspace', 'multi-repo', {
    generatedAt: '2025-01-15T10:00:00.000Z',
    ctxifyVersion: '2.0.0',
  });

  it('frontmatter has ctxify "2.0" and mode', () => {
    const fm = parseFrontmatter(output);
    expect(fm).not.toBeNull();
    expect(fm!.ctxify).toBe('2.0');
    expect(fm!.mode).toBe('multi-repo');
  });

  it('frontmatter has repos list and scanned_at', () => {
    const fm = parseFrontmatter(output);
    expect(fm!.scanned_at).toBe('2025-01-15T10:00:00.000Z');
    expect(fm!.repos).toEqual(['api-server', 'web-ui']);
  });

  it('frontmatter does NOT have workspace or totals', () => {
    const fm = parseFrontmatter(output);
    expect(fm!.workspace).toBeUndefined();
    expect(fm!.totals).toBeUndefined();
  });

  it('repo table has language and framework', () => {
    expect(output).toContain('api-server');
    expect(output).toContain('web-ui');
    expect(output).toContain('typescript');
    expect(output).toContain('hono');
    expect(output).toContain('react');
    expect(output).toContain('| Repo');
  });

  it('repo table links to repos/{name}/overview.md', () => {
    expect(output).toContain('repos/api-server/overview.md');
    expect(output).toContain('repos/web-ui/overview.md');
  });

  it('has TODO markers', () => {
    expect(output).toContain('<!-- TODO:');
  });

  it('does NOT have old shard links', () => {
    expect(output).not.toContain('endpoints/');
    expect(output).not.toContain('topology/');
    expect(output).not.toContain('types/shared.md');
    expect(output).not.toContain('env/all.md');
    expect(output).not.toContain('_analysis.md');
  });

  it('has Relationships, Commands, and Workflows sections', () => {
    expect(output).toContain('## Relationships');
    expect(output).toContain('## Commands');
    expect(output).toContain('## Workflows');
  });
});

// ── Repo template ────────────────────────────────────────────────────────

describe('repo template', () => {
  const repo = makeRepo();
  const output = generateRepoTemplate(repo);

  it('has YAML frontmatter with repo metadata but NOT mechanical fields', () => {
    const fm = parseFrontmatter(output);
    expect(fm).not.toBeNull();
    expect(fm!.repo).toBe('api-server');
    expect(fm!.type).toBe('overview');
    expect(fm!.language).toBe('typescript');
    expect(fm!.framework).toBe('hono');
    // Mechanical fields removed
    expect(fm!.entry_points).toBeUndefined();
    expect(fm!.file_count).toBeUndefined();
  });

  it('has name heading', () => {
    expect(output).toMatch(/^# api-server/m);
  });

  it('does NOT contain entry points line', () => {
    expect(output).not.toContain('Entry points:');
  });

  it('does NOT contain pre-filled scripts', () => {
    expect(output).not.toContain('**dev**:');
    expect(output).not.toContain('**build**:');
    expect(output).not.toContain('**test**:');
    expect(output).not.toContain('## Commands');
  });

  it('filters key dirs to ≤2 segments and excludes noise', () => {
    // Kept: src, src/routes, src/middleware (≤2 segments, not noise)
    expect(output).toContain('`src/`');
    expect(output).toContain('`src/routes/`');
    expect(output).toContain('`src/middleware/`');
    // Filtered: src/services/dropoff (3 segments)
    expect(output).not.toContain('src/services/dropoff');
    // Filtered: patches/legacy (noise pattern)
    expect(output).not.toContain('patches/');
    // Filtered: tests/unit (noise pattern)
    expect(output).not.toContain('tests/unit');
  });

  it('does NOT list dependencies', () => {
    expect(output).not.toContain('hono 4.0.0');
    expect(output).not.toContain('zod 3.22.0');
    expect(output).not.toContain('## Dependencies');
    expect(output).not.toContain('## Dev Dependencies');
  });

  it('has Architecture and Context sections', () => {
    expect(output).toContain('## Architecture');
    expect(output).toContain('## Context');
  });

  it('does NOT have inline Patterns or Domains sections', () => {
    expect(output).not.toContain('## Patterns');
    expect(output).not.toContain('## Domains');
  });

  it('Architecture TODO asks for operational context', () => {
    expect(output).toContain('why it');
    expect(output).toContain('What would surprise someone');
  });

  it('key dirs TODO asks for operational context', () => {
    expect(output).toContain('why it');
  });

  it('Context section references patterns.md', () => {
    expect(output).toContain('`patterns.md`');
  });

  it('Context section includes domain file guidance', () => {
    expect(output).toContain('`{domain}.md`');
    expect(output).toContain('Domain files');
  });

  it('has domain-index segment markers', () => {
    expect(output).toContain('<!-- domain-index -->');
    expect(output).toContain('<!-- /domain-index -->');
  });

  it('has TODO markers', () => {
    expect(output).toContain('<!-- TODO:');
  });
});
