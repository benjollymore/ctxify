import { describe, it, expect } from 'vitest';
import { createWorkspaceContext } from '../../src/core/context.js';
import type { CtxConfig } from '../../src/core/config.js';

describe('context', () => {
  function makeConfig(): CtxConfig {
    return {
      version: '1',
      workspace: '/tmp/test-workspace',
      repos: [],
      relationships: [],
      options: {
        outputDir: '.ctx',
        maxFileSize: 100_000,
        maxDepth: 5,
        includePatterns: [],
        excludePatterns: ['node_modules', '.git'],
      },
    };
  }

  describe('createWorkspaceContext', () => {
    it('should return a context with empty arrays', () => {
      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/tmp/test-workspace');

      expect(ctx.repos).toEqual([]);
      expect(ctx.apiEndpoints).toEqual([]);
      expect(ctx.sharedTypes).toEqual([]);
      expect(ctx.envVars).toEqual([]);
      expect(ctx.relationships).toEqual([]);
      expect(ctx.conventions).toEqual([]);
      expect(ctx.dbSchemas).toEqual([]);
      expect(ctx.questions).toEqual([]);
      expect(ctx.answers).toEqual({});
    });

    it('should store the config reference', () => {
      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/tmp/test-workspace');

      expect(ctx.config).toBe(config);
    });

    it('should store the workspace root', () => {
      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/my/workspace');

      expect(ctx.workspaceRoot).toBe('/my/workspace');
    });

    it('should have metadata with correct version', () => {
      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/tmp/test-workspace');

      expect(ctx.metadata.ctxifyVersion).toBe('0.1.0');
    });

    it('should have metadata with generatedAt as ISO string', () => {
      const before = new Date().toISOString();
      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/tmp/test-workspace');
      const after = new Date().toISOString();

      expect(ctx.metadata.generatedAt).toBeTruthy();
      // generatedAt should be between before and after timestamps
      expect(ctx.metadata.generatedAt >= before).toBe(true);
      expect(ctx.metadata.generatedAt <= after).toBe(true);
    });

    it('should have empty gitRevisions in metadata', () => {
      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/tmp/test-workspace');

      expect(ctx.metadata.gitRevisions).toEqual({});
    });
  });
});
