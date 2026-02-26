import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';
import { generateIndexTemplate, type RepoTemplateData } from '../../src/templates/index-md.js';
import { generateRepoTemplate } from '../../src/templates/repo.js';
import { generateEndpointsTemplate } from '../../src/templates/endpoints.js';
import { generateTypesTemplate } from '../../src/templates/types.js';
import { generateEnvTemplate } from '../../src/templates/env.js';
import { generateTopologyTemplate } from '../../src/templates/topology.js';
import { generateSchemasTemplate } from '../../src/templates/schemas.js';
import { generateQuestionsTemplate } from '../../src/templates/questions.js';
import { generateAnalysisChecklist } from '../../src/templates/analysis.js';

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
    scripts: { dev: 'tsx watch src/index.ts', build: 'tsc', test: 'vitest run' },
    manifestType: 'package.json',
    entryPoints: ['src/index.ts', 'bin/cli.ts'],
    keyDirs: ['src', 'src/routes', 'src/middleware'],
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

  it('frontmatter has scanned_at and workspace', () => {
    const fm = parseFrontmatter(output);
    expect(fm!.scanned_at).toBe('2025-01-15T10:00:00.000Z');
    expect(fm!.workspace).toBe('/workspace');
  });

  it('totals show 0 for agent-filled sections', () => {
    const fm = parseFrontmatter(output);
    const totals = fm!.totals as Record<string, number>;
    expect(totals.repos).toBe(2);
    expect(totals.endpoints).toBe(0);
    expect(totals.shared_types).toBe(0);
    expect(totals.env_vars).toBe(0);
  });

  it('repo table has mechanical data', () => {
    expect(output).toContain('api-server');
    expect(output).toContain('web-ui');
    expect(output).toContain('typescript');
    expect(output).toContain('hono');
    expect(output).toContain('react');
    // Check table structure
    expect(output).toContain('| Repo');
    expect(output).toContain('| Language');
  });

  it('TODO markers are present', () => {
    expect(output).toContain('<!-- TODO:');
  });

  it('shard pointers are present', () => {
    expect(output).toContain('repos/api-server.md');
    expect(output).toContain('repos/web-ui.md');
    expect(output).toContain('endpoints/');
    expect(output).toContain('topology/graph.md');
    expect(output).toContain('types/shared.md');
    expect(output).toContain('env/all.md');
    expect(output).toContain('questions/pending.md');
    expect(output).toContain('_analysis.md');
  });
});

// ── Repo template ────────────────────────────────────────────────────────

describe('repo template', () => {
  const repo = makeRepo();
  const output = generateRepoTemplate(repo);

  it('has name heading', () => {
    expect(output).toMatch(/^# api-server/m);
  });

  it('has dependencies listed', () => {
    expect(output).toContain('hono');
    expect(output).toContain('4.0.0');
    expect(output).toContain('zod');
  });

  it('has dev dependencies listed', () => {
    expect(output).toContain('typescript');
    expect(output).toContain('5.6.0');
  });

  it('has scripts listed', () => {
    expect(output).toContain('dev');
    expect(output).toContain('tsx watch src/index.ts');
    expect(output).toContain('build');
    expect(output).toContain('tsc');
  });

  it('has structure with key dirs', () => {
    expect(output).toContain('## Structure');
    expect(output).toContain('src/');
    expect(output).toContain('src/routes/');
  });

  it('has entry points', () => {
    expect(output).toContain('src/index.ts');
    expect(output).toContain('bin/cli.ts');
  });

  it('has TODO markers', () => {
    expect(output).toContain('<!-- TODO:');
  });
});

// ── Endpoints template ───────────────────────────────────────────────────

describe('endpoints template', () => {
  const output = generateEndpointsTemplate('api-server');

  it('has repo name', () => {
    expect(output).toContain('api-server');
  });

  it('has "Endpoints" in heading', () => {
    expect(output).toMatch(/# .+Endpoints/);
  });

  it('has TODO with segment marker example', () => {
    expect(output).toContain('<!-- TODO:');
    expect(output).toContain('<!-- endpoint:');
  });
});

// ── Types template ───────────────────────────────────────────────────────

describe('types template', () => {
  it('"Shared Types" for multi-repo', () => {
    const output = generateTypesTemplate('multi-repo');
    expect(output).toContain('# Shared Types');
  });

  it('"Shared Types" for mono-repo', () => {
    const output = generateTypesTemplate('mono-repo');
    expect(output).toContain('# Shared Types');
  });

  it('"Exported Types" for single-repo', () => {
    const output = generateTypesTemplate('single-repo');
    expect(output).toContain('# Exported Types');
  });

  it('has TODO with segment marker', () => {
    const output = generateTypesTemplate('multi-repo');
    expect(output).toContain('<!-- TODO:');
    expect(output).toContain('<!-- type:');
  });
});

// ── Env template ─────────────────────────────────────────────────────────

describe('env template', () => {
  const output = generateEnvTemplate();

  it('has header', () => {
    expect(output).toContain('# Environment Variables');
  });

  it('has segment marker example', () => {
    expect(output).toContain('<!-- env:');
  });
});

// ── Topology template ────────────────────────────────────────────────────

describe('topology template', () => {
  const repos = [makeRepo(), makeRepoB()];
  const output = generateTopologyTemplate(repos);

  it('has repo list with tech stack', () => {
    expect(output).toContain('api-server');
    expect(output).toContain('typescript');
    expect(output).toContain('hono');
    expect(output).toContain('web-ui');
    expect(output).toContain('react');
  });

  it('has TODO for connections', () => {
    expect(output).toContain('<!-- TODO:');
  });
});

// ── Schemas template ─────────────────────────────────────────────────────

describe('schemas template', () => {
  const output = generateSchemasTemplate('api-server');

  it('has repo name', () => {
    expect(output).toContain('api-server');
  });

  it('has TODO with segment marker', () => {
    expect(output).toContain('<!-- TODO:');
    expect(output).toContain('<!-- model:');
  });
});

// ── Questions template ───────────────────────────────────────────────────

describe('questions template', () => {
  const output = generateQuestionsTemplate();

  it('has header', () => {
    expect(output).toContain('# Pending Questions');
  });

  it('has TODO', () => {
    expect(output).toContain('<!-- TODO:');
  });
});

// ── Analysis checklist ───────────────────────────────────────────────────

describe('analysis checklist', () => {
  const repos = [makeRepo(), makeRepoB()];
  const output = generateAnalysisChecklist(repos);

  it('frontmatter has status=pending', () => {
    const fm = parseFrontmatter(output);
    expect(fm).not.toBeNull();
    expect(fm!.status).toBe('pending');
  });

  it('frontmatter lists repo names', () => {
    const fm = parseFrontmatter(output);
    const repoNames = fm!.repos as string[];
    expect(repoNames).toContain('api-server');
    expect(repoNames).toContain('web-ui');
  });

  it('lists repos with language/framework and file count', () => {
    expect(output).toContain('api-server');
    expect(output).toContain('typescript');
    expect(output).toContain('hono');
    expect(output).toContain('42');
    expect(output).toContain('web-ui');
    expect(output).toContain('react');
    expect(output).toContain('120');
  });

  it('has per-shard checklist items', () => {
    // Should have unchecked checkbox items
    expect(output).toContain('- [ ]');
    // Should reference shard types
    expect(output).toContain('endpoint');
    expect(output).toContain('type');
    expect(output).toContain('env');
    expect(output).toContain('schema');
  });
});
