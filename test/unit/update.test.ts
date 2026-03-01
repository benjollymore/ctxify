import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runUpdate, updateRepoTable } from '../../src/cli/commands/update.js';
import { serializeConfig, generateDefaultConfig } from '../../src/core/config.js';
import type { CtxConfig, RepoEntry } from '../../src/core/config.js';
import { dumpYaml } from '../../src/utils/yaml.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-update-'));
}

function writeCtxYaml(dir: string, overrides: Partial<CtxConfig> = {}): void {
  const config = generateDefaultConfig(dir, [], 'single-repo');
  const raw = { ...JSON.parse(JSON.stringify(config)), ...overrides };
  writeFileSync(join(dir, 'ctx.yaml'), serializeConfig(raw as CtxConfig), 'utf-8');
}

function createPackageJson(
  dir: string,
  name: string,
  extras: Record<string, unknown> = {},
): void {
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...extras }, null, 2),
    'utf-8',
  );
}

function writeOverviewMd(dir: string, repoName: string, body: string, fm: Record<string, unknown> = {}): void {
  const repoDir = join(dir, '.ctxify', 'repos', repoName);
  mkdirSync(repoDir, { recursive: true });
  const frontmatter = dumpYaml({
    repo: repoName,
    type: 'overview',
    ...fm,
  }).trimEnd();
  writeFileSync(
    join(repoDir, 'overview.md'),
    `---\n${frontmatter}\n---\n\n${body}`,
    'utf-8',
  );
}

function writeIndexMd(dir: string, content: string): void {
  const ctxifyDir = join(dir, '.ctxify');
  mkdirSync(ctxifyDir, { recursive: true });
  writeFileSync(join(ctxifyDir, 'index.md'), content, 'utf-8');
}

describe('runUpdate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('errors when ctx.yaml is missing', async () => {
    await expect(runUpdate(tmpDir)).rejects.toThrow('ctx.yaml not found');
  });

  it('no-op when nothing changed (single-repo)', async () => {
    createPackageJson(tmpDir, 'my-app', { dependencies: { express: '^4.0.0' } });
    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app', language: 'javascript', framework: 'express' }],
    });

    const fmData = { repo: 'my-app', type: 'overview', language: 'javascript', framework: 'express' };
    writeOverviewMd(tmpDir, 'my-app', '# my-app\n\nAgent content.', fmData);
    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - my-app
scanned_at: '2025-01-01T00:00:00.000Z'
---

# workspace

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [my-app](repos/my-app/overview.md) | javascript | express | CLI tool |
`);

    const result = await runUpdate(tmpDir);

    expect(result.status).toBe('updated');
    expect(result.repos_current).toEqual(['my-app']);
    expect(result.repos_added).toEqual([]);
    expect(result.repos_removed).toEqual([]);
  });

  it('updates language/framework in overview.md frontmatter when deps change', async () => {
    // Start with javascript/express
    createPackageJson(tmpDir, 'my-app', {
      dependencies: { express: '^4.0.0' },
      devDependencies: { typescript: '^5.0.0' },
    });

    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app', language: 'javascript', framework: 'express' }],
    });

    writeOverviewMd(tmpDir, 'my-app', '# my-app\n\nAgent-written architecture.', {
      language: 'javascript',
      framework: 'express',
    });

    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - my-app
scanned_at: '2025-01-01T00:00:00.000Z'
---

# workspace
`);

    const result = await runUpdate(tmpDir);

    expect(result.status).toBe('updated');

    // Check overview.md frontmatter was updated
    const overview = readFileSync(
      join(tmpDir, '.ctxify', 'repos', 'my-app', 'overview.md'),
      'utf-8',
    );
    expect(overview).toContain('language: typescript');
    expect(overview).toContain('framework: express');
  });

  it('preserves agent-written prose in overview.md body', async () => {
    createPackageJson(tmpDir, 'my-app', {
      devDependencies: { typescript: '^5.0.0' },
    });

    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app', language: 'javascript' }],
    });

    const agentContent = '# my-app\n\nThis is detailed architecture written by an agent.\n\n## Domains\n\nSome domain info.';
    writeOverviewMd(tmpDir, 'my-app', agentContent, { language: 'javascript' });

    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - my-app
scanned_at: '2025-01-01T00:00:00.000Z'
---

# workspace
`);

    await runUpdate(tmpDir);

    const overview = readFileSync(
      join(tmpDir, '.ctxify', 'repos', 'my-app', 'overview.md'),
      'utf-8',
    );
    expect(overview).toContain('This is detailed architecture written by an agent.');
    expect(overview).toContain('## Domains');
    expect(overview).toContain('Some domain info.');
  });

  it('updates repo table Language/Framework while preserving Role', async () => {
    createPackageJson(tmpDir, 'my-app', {
      dependencies: { hono: '^4.0.0' },
      devDependencies: { typescript: '^5.0.0' },
    });

    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app', language: 'javascript', framework: 'express' }],
    });

    writeOverviewMd(tmpDir, 'my-app', '# my-app', { language: 'javascript', framework: 'express' });

    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - my-app
scanned_at: '2025-01-01T00:00:00.000Z'
---

# workspace

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [my-app](repos/my-app/overview.md) | javascript | express | API server |
`);

    const result = await runUpdate(tmpDir);
    expect(result.table_updated).toBe(true);

    const indexContent = readFileSync(join(tmpDir, '.ctxify', 'index.md'), 'utf-8');
    expect(indexContent).toContain('typescript');
    expect(indexContent).toContain('hono');
    expect(indexContent).toContain('API server');
    expect(indexContent).not.toMatch(/\|\s*javascript\s*\|/);
  });

  it('detects new repo in monorepo and scaffolds overview.md', async () => {
    // Set up monorepo with workspaces
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'monorepo',
        workspaces: ['packages/*'],
      }),
      'utf-8',
    );

    // Existing package
    const pkgA = join(tmpDir, 'packages', 'pkg-a');
    mkdirSync(pkgA, { recursive: true });
    createPackageJson(pkgA, 'pkg-a');

    // New package
    const pkgB = join(tmpDir, 'packages', 'pkg-b');
    mkdirSync(pkgB, { recursive: true });
    createPackageJson(pkgB, 'pkg-b', { devDependencies: { typescript: '^5.0.0' } });

    writeCtxYaml(tmpDir, {
      mode: 'mono-repo',
      monoRepo: { manager: 'npm', packageGlobs: ['packages/*'] },
      repos: [{ path: 'packages/pkg-a', name: 'pkg-a', language: 'javascript' }],
    });

    writeOverviewMd(tmpDir, 'pkg-a', '# pkg-a\n\nExisting content.', { language: 'javascript' });

    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: mono-repo
repos:
  - pkg-a
scanned_at: '2025-01-01T00:00:00.000Z'
---

# monorepo

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [pkg-a](repos/pkg-a/overview.md) | javascript | -- | Core lib |
`);

    const result = await runUpdate(tmpDir);

    expect(result.repos_added).toContain('pkg-b');
    expect(existsSync(join(tmpDir, '.ctxify', 'repos', 'pkg-b', 'overview.md'))).toBe(true);

    const pkgBOverview = readFileSync(
      join(tmpDir, '.ctxify', 'repos', 'pkg-b', 'overview.md'),
      'utf-8',
    );
    expect(pkgBOverview).toContain('# pkg-b');
  });

  it('reports removed repo without deleting context', async () => {
    createPackageJson(tmpDir, 'my-app');

    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [
        { path: '.', name: 'my-app' },
        { path: 'old-service', name: 'old-service' },
      ],
    });

    writeOverviewMd(tmpDir, 'my-app', '# my-app', {});
    writeOverviewMd(tmpDir, 'old-service', '# old-service\n\nValuable domain knowledge.', {});

    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - my-app
  - old-service
scanned_at: '2025-01-01T00:00:00.000Z'
---

# workspace
`);

    const result = await runUpdate(tmpDir);

    expect(result.repos_removed).toContain('old-service');
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0]).toContain('old-service');

    // Context files should still exist
    expect(
      existsSync(join(tmpDir, '.ctxify', 'repos', 'old-service', 'overview.md')),
    ).toBe(true);
  });

  it('preserves ctx.yaml relationships/skills/options', async () => {
    createPackageJson(tmpDir, 'my-app');

    const relationships = [
      { from: 'api', to: 'web', type: 'dependency' as const },
    ];
    const skills = {
      claude: { path: '.claude/skills/ctxify.md', scope: 'workspace' as const },
    };

    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
      relationships,
      skills,
      install_method: 'global',
    });

    writeOverviewMd(tmpDir, 'my-app', '# my-app', {});
    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - my-app
scanned_at: '2025-01-01T00:00:00.000Z'
---

# workspace
`);

    await runUpdate(tmpDir);

    // Re-read ctx.yaml and check preserved fields
    const { loadConfig } = await import('../../src/core/config.js');
    const config = loadConfig(join(tmpDir, 'ctx.yaml'));

    expect(config.relationships).toEqual(relationships);
    expect(config.skills).toEqual(skills);
    expect(config.install_method).toBe('global');
  });

  it('dry-run writes nothing', async () => {
    createPackageJson(tmpDir, 'my-app', {
      devDependencies: { typescript: '^5.0.0' },
    });

    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app', language: 'javascript' }],
    });

    writeOverviewMd(tmpDir, 'my-app', '# my-app', { language: 'javascript' });

    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - my-app
scanned_at: '2025-01-01T00:00:00.000Z'
---

# workspace
`);

    // Save original content
    const originalOverview = readFileSync(
      join(tmpDir, '.ctxify', 'repos', 'my-app', 'overview.md'),
      'utf-8',
    );
    const originalCtxYaml = readFileSync(join(tmpDir, 'ctx.yaml'), 'utf-8');

    const result = await runUpdate(tmpDir, { dryRun: true });

    expect(result.status).toBe('updated');

    // Files should be unchanged
    expect(readFileSync(join(tmpDir, '.ctxify', 'repos', 'my-app', 'overview.md'), 'utf-8')).toBe(
      originalOverview,
    );
    expect(readFileSync(join(tmpDir, 'ctx.yaml'), 'utf-8')).toBe(originalCtxYaml);
  });

  it('handles missing index.md gracefully', async () => {
    createPackageJson(tmpDir, 'my-app');

    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    writeOverviewMd(tmpDir, 'my-app', '# my-app', {});

    // No index.md written

    const result = await runUpdate(tmpDir);

    expect(result.status).toBe('updated');
    expect(result.frontmatter_updated).not.toContain('index.md');
  });

  it('handles missing overview frontmatter gracefully', async () => {
    createPackageJson(tmpDir, 'my-app', {
      devDependencies: { typescript: '^5.0.0' },
    });

    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    // Write overview without frontmatter
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'overview.md'), '# my-app\n\nNo frontmatter here.', 'utf-8');

    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - my-app
scanned_at: '2025-01-01T00:00:00.000Z'
---

# workspace
`);

    const result = await runUpdate(tmpDir);

    expect(result.status).toBe('updated');
    // Should not crash — overview just won't have frontmatter updated
    const overview = readFileSync(join(repoDir, 'overview.md'), 'utf-8');
    expect(overview).toContain('No frontmatter here.');
  });

  it('updates scanned_at in index.md frontmatter', async () => {
    createPackageJson(tmpDir, 'my-app');

    writeCtxYaml(tmpDir, {
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    writeOverviewMd(tmpDir, 'my-app', '# my-app', {});

    writeIndexMd(tmpDir, `---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - my-app
scanned_at: '2020-01-01T00:00:00.000Z'
---

# workspace
`);

    await runUpdate(tmpDir);

    const indexContent = readFileSync(join(tmpDir, '.ctxify', 'index.md'), 'utf-8');
    expect(indexContent).not.toContain('2020-01-01');
  });
});

describe('updateRepoTable', () => {
  it('updates Language and Framework columns while preserving Role', () => {
    const content = `# workspace

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [my-app](repos/my-app/overview.md) | javascript | express | API server |
`;

    const manifests = new Map();
    manifests.set('my-app', {
      name: 'my-app',
      path: '.',
      language: 'typescript',
      framework: 'hono',
    });

    const result = updateRepoTable(content, manifests, []);

    expect(result).toContain('typescript');
    expect(result).toContain('hono');
    expect(result).toContain('API server');
    expect(result).not.toContain('javascript');
    expect(result).not.toContain('express');
  });

  it('appends new rows for added repos', () => {
    const content = `## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [api](repos/api/overview.md) | typescript | express | Backend |
`;

    const manifests = new Map();
    manifests.set('api', { name: 'api', path: 'api', language: 'typescript', framework: 'express' });
    manifests.set('web', { name: 'web', path: 'web', language: 'typescript', framework: 'react' });

    const result = updateRepoTable(content, manifests, ['web']);

    expect(result).toContain('[web](repos/web/overview.md)');
    expect(result).toContain('react');
    expect(result).toContain('<!-- TODO: role -->');
  });

  it('returns content unchanged when no repo table found', () => {
    const content = '# workspace\n\nNo table here.';
    const result = updateRepoTable(content, new Map(), []);
    expect(result).toBe(content);
  });
});
