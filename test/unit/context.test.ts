import { describe, it, expect } from 'vitest';
import type {
  RepoInfo,
  ApiEndpoint,
  SharedType,
  EnvVar,
  InferredRelationship,
  Convention,
  DbSchema,
  Question,
} from '../../src/core/context.js';

describe('context types', () => {
  it('RepoInfo type can be used as a value shape', () => {
    const repo: RepoInfo = {
      name: 'test',
      path: '.',
      language: 'typescript',
      framework: 'hono',
      description: 'test repo',
      entryPoints: ['src/index.ts'],
      keyDirs: ['src'],
      fileCount: 10,
      dependencies: {},
      devDependencies: {},
      scripts: {},
      manifestType: 'package.json',
    };
    expect(repo.name).toBe('test');
  });

  it('ApiEndpoint type can be used as a value shape', () => {
    const endpoint: ApiEndpoint = {
      repo: 'api',
      method: 'GET',
      path: '/users',
      file: 'src/routes/users.ts',
    };
    expect(endpoint.method).toBe('GET');
  });

  it('SharedType type can be used as a value shape', () => {
    const shared: SharedType = {
      name: 'User',
      kind: 'interface',
      definedIn: 'api',
      file: 'src/types.ts',
      usedBy: ['web'],
    };
    expect(shared.kind).toBe('interface');
  });

  it('EnvVar type can be used as a value shape', () => {
    const env: EnvVar = {
      name: 'DATABASE_URL',
      repos: ['api'],
      sources: [{ repo: 'api', file: '.env', type: 'env-file' }],
    };
    expect(env.name).toBe('DATABASE_URL');
  });

  it('InferredRelationship type can be used as a value shape', () => {
    const rel: InferredRelationship = {
      from: 'web',
      to: 'api',
      type: 'api-consumer',
      evidence: 'fetch calls',
      confidence: 0.9,
    };
    expect(rel.type).toBe('api-consumer');
  });

  it('Convention type can be used as a value shape', () => {
    const conv: Convention = {
      repo: 'api',
      category: 'naming',
      pattern: 'camelCase',
      description: 'Uses camelCase for variables',
    };
    expect(conv.category).toBe('naming');
  });

  it('DbSchema type can be used as a value shape', () => {
    const schema: DbSchema = {
      repo: 'api',
      orm: 'prisma',
      file: 'prisma/schema.prisma',
      models: [{ name: 'User', fields: [{ name: 'id', type: 'Int' }] }],
    };
    expect(schema.orm).toBe('prisma');
  });

  it('Question type can be used as a value shape', () => {
    const q: Question = {
      id: 'q1',
      source: 'relationship',
      category: 'relationship',
      question: 'Does web call api directly?',
      context: 'Found fetch calls',
      confidence: 0.6,
    };
    expect(q.category).toBe('relationship');
  });
});
