import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dumpYaml } from '../../src/utils/yaml.js';

// Query command reads files from .ctx/ directory. We'll set up a fake shard directory
// and test the filtering logic by simulating what the command does internally.

function createTestShards(baseDir: string): void {
  const ctxDir = join(baseDir, '.ctx');

  // index.yaml
  mkdirSync(ctxDir, { recursive: true });
  writeFileSync(join(ctxDir, 'index.yaml'), dumpYaml({
    ctxify: '2.0',
    scanned_at: '2026-02-25T10:00:00Z',
    workspace: baseDir,
    repos: [
      { name: 'api', language: 'typescript', framework: 'hono', path: './api', endpoints: 3 },
      { name: 'web', language: 'typescript', framework: 'react', path: './web' },
    ],
    totals: { repos: 2, endpoints: 3, shared_types: 2, env_vars: 3 },
  }));

  // repos/
  mkdirSync(join(ctxDir, 'repos'), { recursive: true });
  writeFileSync(join(ctxDir, 'repos', 'api.yaml'), dumpYaml({
    name: 'api', language: 'typescript', framework: 'hono',
    scripts: { dev: 'tsx watch' }, dependencies: { hono: '4.0.0' },
  }));
  writeFileSync(join(ctxDir, 'repos', 'web.yaml'), dumpYaml({
    name: 'web', language: 'typescript', framework: 'react',
    scripts: { dev: 'vite' }, dependencies: { react: '18.2.0' },
  }));

  // endpoints/
  mkdirSync(join(ctxDir, 'endpoints'), { recursive: true });
  writeFileSync(join(ctxDir, 'endpoints', 'api.yaml'), dumpYaml({
    repo: 'api',
    endpoints: [
      { method: 'GET', path: '/users', file: 'src/routes/users.ts', handler: 'getUsers', line: 5 },
      { method: 'POST', path: '/users', file: 'src/routes/users.ts', handler: 'createUser', line: 20 },
      { method: 'GET', path: '/health', file: 'src/index.ts', handler: null, line: 10 },
    ],
  }));

  // types/
  mkdirSync(join(ctxDir, 'types'), { recursive: true });
  writeFileSync(join(ctxDir, 'types', 'shared.yaml'), dumpYaml({
    shared_types: [
      { name: 'UserProfile', kind: 'interface', defined_in: 'api', file: 'src/types.ts', used_by: ['web'], properties: ['id', 'name'] },
      { name: 'ApiResponse', kind: 'type', defined_in: 'api', file: 'src/types.ts', used_by: ['web'] },
    ],
  }));

  // env/
  mkdirSync(join(ctxDir, 'env'), { recursive: true });
  writeFileSync(join(ctxDir, 'env', 'all.yaml'), dumpYaml({
    env_vars: [
      { name: 'PORT', repos: ['api'], sources: [{ repo: 'api', file: '.env', type: 'env-file' }] },
      { name: 'API_URL', repos: ['web'], sources: [{ repo: 'web', file: 'src/config.ts', type: 'code-reference' }] },
      { name: 'DATABASE_URL', repos: ['api', 'web'], sources: [{ repo: 'api', file: '.env', type: 'env-file' }] },
    ],
  }));

  // topology/
  mkdirSync(join(ctxDir, 'topology'), { recursive: true });
  writeFileSync(join(ctxDir, 'topology', 'graph.yaml'), dumpYaml({
    repos: [{ name: 'api' }, { name: 'web' }],
    edges: [{ from: 'web', to: 'api', type: 'api-consumer', confidence: 0.9 }],
  }));

  // questions/
  mkdirSync(join(ctxDir, 'questions'), { recursive: true });
  writeFileSync(join(ctxDir, 'questions', 'pending.yaml'), dumpYaml({
    pending: 1,
    questions: [{ id: 'q1', question: 'Does web call api directly?', category: 'relationship' }],
  }));
}

// Helper to simulate query filtering logic (extracted from the command)
function filterEndpoints(
  data: { endpoints?: Array<Record<string, unknown>> },
  method?: string,
  pathContains?: string,
): { endpoints: Array<Record<string, unknown>> } {
  let endpoints = data.endpoints || [];
  if (method) {
    endpoints = endpoints.filter(
      (ep) => typeof ep.method === 'string' && ep.method.toUpperCase() === method.toUpperCase(),
    );
  }
  if (pathContains) {
    endpoints = endpoints.filter(
      (ep) => typeof ep.path === 'string' && (ep.path as string).includes(pathContains),
    );
  }
  return { ...data, endpoints };
}

function filterTypes(
  data: { shared_types?: Array<Record<string, unknown>> },
  name?: string,
): { shared_types: Array<Record<string, unknown>> } {
  if (!name) return data as { shared_types: Array<Record<string, unknown>> };
  const types = (data.shared_types || []).filter(
    (t) => typeof t.name === 'string' && t.name === name,
  );
  return { ...data, shared_types: types };
}

function filterEnvByRepo(
  data: { env_vars?: Array<{ name: string; repos: string[] }> },
  repo: string,
): { env_vars: Array<{ name: string; repos: string[] }> } {
  const filtered = (data.env_vars || []).filter((e) => e.repos.includes(repo));
  return { env_vars: filtered };
}

describe('query filtering: endpoints', () => {
  const testData = {
    endpoints: [
      { method: 'GET', path: '/users', handler: 'getUsers' },
      { method: 'POST', path: '/users', handler: 'createUser' },
      { method: 'GET', path: '/health', handler: null },
      { method: 'DELETE', path: '/users/:id', handler: 'deleteUser' },
    ],
  };

  it('filters by method', () => {
    const result = filterEndpoints(testData, 'GET');
    expect(result.endpoints).toHaveLength(2);
    expect(result.endpoints.every((e) => e.method === 'GET')).toBe(true);
  });

  it('filters by method case-insensitively', () => {
    const result = filterEndpoints(testData, 'post');
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].method).toBe('POST');
  });

  it('filters by path-contains', () => {
    const result = filterEndpoints(testData, undefined, 'users');
    expect(result.endpoints).toHaveLength(3);
  });

  it('filters by method AND path-contains', () => {
    const result = filterEndpoints(testData, 'GET', 'users');
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].path).toBe('/users');
  });

  it('returns all when no filters', () => {
    const result = filterEndpoints(testData);
    expect(result.endpoints).toHaveLength(4);
  });

  it('returns empty when no matches', () => {
    const result = filterEndpoints(testData, 'PATCH');
    expect(result.endpoints).toHaveLength(0);
  });
});

describe('query filtering: types', () => {
  const testData = {
    shared_types: [
      { name: 'UserProfile', kind: 'interface' },
      { name: 'ApiResponse', kind: 'type' },
      { name: 'Config', kind: 'interface' },
    ],
  };

  it('filters by exact name', () => {
    const result = filterTypes(testData, 'UserProfile');
    expect(result.shared_types).toHaveLength(1);
    expect(result.shared_types[0].name).toBe('UserProfile');
  });

  it('returns all when no name filter', () => {
    const result = filterTypes(testData);
    expect(result.shared_types).toHaveLength(3);
  });

  it('returns empty when name not found', () => {
    const result = filterTypes(testData, 'NonExistent');
    expect(result.shared_types).toHaveLength(0);
  });
});

describe('query filtering: env by repo', () => {
  const testData = {
    env_vars: [
      { name: 'PORT', repos: ['api'] },
      { name: 'API_URL', repos: ['web'] },
      { name: 'DATABASE_URL', repos: ['api', 'web'] },
    ],
  };

  it('filters env vars by repo', () => {
    const result = filterEnvByRepo(testData, 'api');
    expect(result.env_vars).toHaveLength(2);
    expect(result.env_vars.map((e) => e.name).sort()).toEqual(['DATABASE_URL', 'PORT']);
  });

  it('returns only web-specific env vars', () => {
    const result = filterEnvByRepo(testData, 'web');
    expect(result.env_vars).toHaveLength(2);
    expect(result.env_vars.map((e) => e.name).sort()).toEqual(['API_URL', 'DATABASE_URL']);
  });

  it('returns empty for unknown repo', () => {
    const result = filterEnvByRepo(testData, 'unknown');
    expect(result.env_vars).toHaveLength(0);
  });
});

describe('query: shard file reading', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-query-'));
    createTestShards(tmpDir);
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('can read and parse index.yaml', () => {
    const content = readFileSync(join(tmpDir, '.ctx', 'index.yaml'), 'utf-8');
    const parsed = JSON.parse(JSON.stringify(require('js-yaml').load(content)));
    expect(parsed.ctxify).toBe('2.0');
    expect(parsed.repos).toHaveLength(2);
  });

  it('can read repo shard', () => {
    const content = readFileSync(join(tmpDir, '.ctx', 'repos', 'api.yaml'), 'utf-8');
    const parsed = JSON.parse(JSON.stringify(require('js-yaml').load(content)));
    expect(parsed.name).toBe('api');
    expect(parsed.framework).toBe('hono');
  });

  it('can read and filter endpoints shard', () => {
    const content = readFileSync(join(tmpDir, '.ctx', 'endpoints', 'api.yaml'), 'utf-8');
    const parsed = require('js-yaml').load(content) as { endpoints: Array<Record<string, unknown>> };
    const filtered = filterEndpoints(parsed, 'POST');
    expect(filtered.endpoints).toHaveLength(1);
    expect(filtered.endpoints[0].path).toBe('/users');
  });

  it('can read and filter types shard by name', () => {
    const content = readFileSync(join(tmpDir, '.ctx', 'types', 'shared.yaml'), 'utf-8');
    const parsed = require('js-yaml').load(content) as { shared_types: Array<Record<string, unknown>> };
    const filtered = filterTypes(parsed, 'UserProfile');
    expect(filtered.shared_types).toHaveLength(1);
    expect(filtered.shared_types[0].name).toBe('UserProfile');
  });

  it('can read and filter env shard by repo', () => {
    const content = readFileSync(join(tmpDir, '.ctx', 'env', 'all.yaml'), 'utf-8');
    const parsed = require('js-yaml').load(content) as { env_vars: Array<{ name: string; repos: string[] }> };
    const filtered = filterEnvByRepo(parsed, 'api');
    expect(filtered.env_vars).toHaveLength(2);
  });
});
