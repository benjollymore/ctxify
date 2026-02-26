import { describe, it, expect } from 'vitest';
import { parseYaml } from '../../src/utils/yaml.js';
import type { WorkspaceContext } from '../../src/core/context.js';
import type { CtxConfig } from '../../src/core/config.js';
import { indexYamlRenderer } from '../../src/renderers/index-yaml.js';
import { shardReposRenderer } from '../../src/renderers/shard-repos.js';
import { shardEndpointsRenderer } from '../../src/renderers/shard-endpoints.js';
import { shardTypesRenderer } from '../../src/renderers/shard-types.js';
import { shardEnvRenderer } from '../../src/renderers/shard-env.js';
import { shardTopologyRenderer } from '../../src/renderers/shard-topology.js';
import { shardSchemasRenderer } from '../../src/renderers/shard-schemas.js';
import { shardQuestionsRenderer } from '../../src/renderers/shard-questions.js';

function createTestConfig(): CtxConfig {
  return {
    version: '1',
    workspace: '/test/workspace',
    repos: [
      { path: './api', name: 'api' },
      { path: './web', name: 'web' },
    ],
    relationships: [],
    options: { outputDir: '.ctxify' },
  };
}

function createTestContext(): WorkspaceContext {
  return {
    config: createTestConfig(),
    workspaceRoot: '/test/workspace',
    repos: [
      {
        name: 'api',
        path: '/test/workspace/api',
        language: 'typescript',
        framework: 'hono',
        description: 'API server',
        entryPoints: ['src/index.ts'],
        keyDirs: ['src', 'src/routes'],
        fileCount: 15,
        dependencies: { hono: '4.0.0' },
        devDependencies: { typescript: '5.6.0' },
        scripts: { dev: 'tsx watch src/index.ts', build: 'tsc' },
        manifestType: 'package.json',
      },
      {
        name: 'web',
        path: '/test/workspace/web',
        language: 'typescript',
        framework: 'react',
        description: 'Frontend',
        entryPoints: ['src/main.tsx'],
        keyDirs: ['src', 'src/components'],
        fileCount: 30,
        dependencies: { react: '18.2.0' },
        devDependencies: { vite: '5.0.0' },
        scripts: { dev: 'vite', build: 'vite build' },
        manifestType: 'package.json',
      },
    ],
    apiEndpoints: [
      { repo: 'api', method: 'GET', path: '/users', file: 'src/routes/users.ts', line: 5, handler: 'getUsers' },
      { repo: 'api', method: 'POST', path: '/users', file: 'src/routes/users.ts', line: 20, handler: 'createUser' },
      { repo: 'api', method: 'GET', path: '/health', file: 'src/index.ts', line: 10 },
    ],
    sharedTypes: [
      { name: 'UserProfile', kind: 'interface', definedIn: 'api', file: 'src/types.ts', usedBy: ['web'], properties: ['id', 'name', 'email'] },
      { name: 'ApiResponse', kind: 'type', definedIn: 'api', file: 'src/types.ts', usedBy: ['web'] },
    ],
    envVars: [
      { name: 'PORT', repos: ['api'], sources: [{ repo: 'api', file: '.env', type: 'env-file' }] },
      { name: 'API_URL', repos: ['web'], sources: [{ repo: 'web', file: 'src/config.ts', type: 'code-reference' }] },
      { name: 'DATABASE_URL', repos: ['api', 'web'], sources: [{ repo: 'api', file: '.env', type: 'env-file' }, { repo: 'web', file: '.env', type: 'env-file' }] },
    ],
    relationships: [
      { from: 'web', to: 'api', type: 'api-consumer', evidence: 'fetch calls to /api', confidence: 0.9 },
      { from: 'web', to: 'api', type: 'shared-types', evidence: 'imports UserProfile', confidence: 0.8 },
    ],
    conventions: [
      { repo: 'api', category: 'tooling', pattern: 'typescript', description: 'Uses TypeScript' },
    ],
    dbSchemas: [
      {
        repo: 'api',
        orm: 'drizzle',
        file: 'src/schema.ts',
        models: [
          { name: 'users', fields: [{ name: 'id', type: 'serial' }, { name: 'name', type: 'text' }] },
        ],
      },
    ],
    questions: [
      { id: 'q1', pass: 'relationship-inference', category: 'relationship', question: 'Does web call api directly?', context: 'Found fetch calls', confidence: 0.6 },
    ],
    answers: {},
    metadata: {
      generatedAt: '2026-02-25T10:00:00Z',
      ctxifyVersion: '2.0.0',
      gitRevisions: { api: 'abc123', web: 'def456' },
    },
  };
}

describe('index-yaml renderer', () => {
  it('produces valid YAML with expected top-level keys', () => {
    const ctx = createTestContext();
    const output = indexYamlRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output);

    expect(parsed).toHaveProperty('ctxify', '2.0');
    expect(parsed).toHaveProperty('scanned_at');
    expect(parsed).toHaveProperty('workspace');
    expect(parsed).toHaveProperty('repos');
    expect(parsed).toHaveProperty('totals');
    expect(parsed).toHaveProperty('shards');
  });

  it('includes correct repo counts in index', () => {
    const ctx = createTestContext();
    const output = indexYamlRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      repos: Array<{ name: string; endpoints?: number; types_defined?: number; types_consumed?: number }>;
      totals: { repos: number; endpoints: number; shared_types: number; env_vars: number };
    };

    expect(parsed.repos).toHaveLength(2);
    expect(parsed.totals.repos).toBe(2);
    expect(parsed.totals.endpoints).toBe(3);
    expect(parsed.totals.shared_types).toBe(2);
    expect(parsed.totals.env_vars).toBe(3);

    const apiEntry = parsed.repos.find((r) => r.name === 'api');
    expect(apiEntry?.endpoints).toBe(3);
    expect(apiEntry?.types_defined).toBe(2);

    const webEntry = parsed.repos.find((r) => r.name === 'web');
    expect(webEntry?.types_consumed).toBe(2);
  });

  it('includes relationships in index', () => {
    const ctx = createTestContext();
    const output = indexYamlRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      relationships: Array<{ from: string; to: string; type: string }>;
    };

    expect(parsed.relationships).toHaveLength(2);
    expect(parsed.relationships[0].from).toBe('web');
    expect(parsed.relationships[0].to).toBe('api');
  });
});

describe('shard-repos renderer', () => {
  it('produces one file per repo', () => {
    const ctx = createTestContext();
    const files = shardReposRenderer.renderAll(ctx);
    expect(files.size).toBe(2);
    expect(files.has('.ctxify/repos/api.yaml')).toBe(true);
    expect(files.has('.ctxify/repos/web.yaml')).toBe(true);
  });

  it('includes expected fields in repo shard', () => {
    const ctx = createTestContext();
    const files = shardReposRenderer.renderAll(ctx);
    const apiContent = files.get('.ctxify/repos/api.yaml')!;
    const parsed = parseYaml<Record<string, unknown>>(apiContent);

    expect(parsed).toHaveProperty('name', 'api');
    expect(parsed).toHaveProperty('language', 'typescript');
    expect(parsed).toHaveProperty('framework', 'hono');
    expect(parsed).toHaveProperty('scripts');
    expect(parsed).toHaveProperty('dependencies');
    expect(parsed).toHaveProperty('dev_dependencies');
    expect(parsed).toHaveProperty('entry_points');
    expect(parsed).toHaveProperty('key_dirs');
    expect(parsed).toHaveProperty('conventions');
  });
});

describe('shard-endpoints renderer', () => {
  it('produces files only for repos with endpoints', () => {
    const ctx = createTestContext();
    const files = shardEndpointsRenderer.renderAll(ctx);
    expect(files.size).toBe(1);
    expect(files.has('.ctxify/endpoints/api.yaml')).toBe(true);
  });

  it('includes all endpoint fields', () => {
    const ctx = createTestContext();
    const files = shardEndpointsRenderer.renderAll(ctx);
    const parsed = parseYaml<Record<string, unknown>>(files.get('.ctxify/endpoints/api.yaml')!) as {
      endpoints: Array<Record<string, unknown>>;
    };

    expect(parsed.endpoints).toHaveLength(3);
    const getUsers = parsed.endpoints.find((e) => e.path === '/users' && e.method === 'GET');
    expect(getUsers).toBeDefined();
    expect(getUsers).toHaveProperty('handler', 'getUsers');
    expect(getUsers).toHaveProperty('line', 5);
  });
});

describe('shard-types renderer', () => {
  it('produces valid YAML with all shared types', () => {
    const ctx = createTestContext();
    const output = shardTypesRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      shared_types: Array<Record<string, unknown>>;
    };

    expect(parsed.shared_types).toHaveLength(2);
    const userProfile = parsed.shared_types.find((t) => t.name === 'UserProfile');
    expect(userProfile).toBeDefined();
    expect(userProfile?.kind).toBe('interface');
    expect(userProfile?.defined_in).toBe('api');
    expect(userProfile?.properties).toEqual(['id', 'name', 'email']);
  });
});

describe('shard-env renderer', () => {
  it('produces valid YAML with all env vars', () => {
    const ctx = createTestContext();
    const output = shardEnvRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      env_vars: Array<{ name: string; repos: string[] }>;
    };

    expect(parsed.env_vars).toHaveLength(3);
    expect(parsed.env_vars.map((e) => e.name)).toContain('PORT');
    expect(parsed.env_vars.map((e) => e.name)).toContain('DATABASE_URL');

    const dbUrl = parsed.env_vars.find((e) => e.name === 'DATABASE_URL');
    expect(dbUrl?.repos).toEqual(['api', 'web']);
  });
});

describe('shard-topology renderer', () => {
  it('produces valid YAML with repos and edges', () => {
    const ctx = createTestContext();
    const output = shardTopologyRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      repos: Array<{ name: string }>;
      edges: Array<{ from: string; to: string; type: string }>;
    };

    expect(parsed.repos).toHaveLength(2);
    expect(parsed.edges).toHaveLength(2);
    expect(parsed.edges[0].from).toBe('web');
    expect(parsed.edges[0].to).toBe('api');
  });
});

describe('shard-schemas renderer', () => {
  it('produces files only for repos with schemas', () => {
    const ctx = createTestContext();
    const files = shardSchemasRenderer.renderAll(ctx);
    expect(files.size).toBe(1);
    expect(files.has('.ctxify/schemas/api.yaml')).toBe(true);
  });

  it('includes model details', () => {
    const ctx = createTestContext();
    const files = shardSchemasRenderer.renderAll(ctx);
    const parsed = parseYaml<Record<string, unknown>>(files.get('.ctxify/schemas/api.yaml')!) as {
      schemas: Array<{ orm: string; models: Array<{ name: string; fields: Array<Record<string, string>> }> }>;
    };

    expect(parsed.schemas).toHaveLength(1);
    expect(parsed.schemas[0].orm).toBe('drizzle');
    expect(parsed.schemas[0].models[0].name).toBe('users');
    expect(parsed.schemas[0].models[0].fields).toHaveLength(2);
  });
});

describe('shard-questions renderer', () => {
  it('produces valid YAML with pending questions', () => {
    const ctx = createTestContext();
    const output = shardQuestionsRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      pending: number;
      questions: Array<{ id: string; question: string }>;
    };

    expect(parsed.pending).toBe(1);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].id).toBe('q1');
  });

  it('filters out answered questions', () => {
    const ctx = createTestContext();
    ctx.answers = { q1: 'Yes, it does.' };

    const output = shardQuestionsRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      pending: number;
      questions: unknown[];
    };

    expect(parsed.pending).toBe(0);
    expect(parsed.questions).toHaveLength(0);
  });
});
