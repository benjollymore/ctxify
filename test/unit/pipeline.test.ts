import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '../../src/core/pipeline.js';
import { PassRegistry } from '../../src/core/pass-registry.js';
import { PassError } from '../../src/core/errors.js';
import { createLogger } from '../../src/core/logger.js';
import { createWorkspaceContext } from '../../src/core/context.js';
import type { CtxConfig } from '../../src/core/config.js';
import type { AnalysisPass } from '../../src/passes/types.js';

function makeConfig(): CtxConfig {
  return {
    version: '1',
    workspace: '/tmp/ws',
    repos: [],
    relationships: [],
    options: {
      outputDir: '.ctx',
      maxFileSize: 100_000,
      maxDepth: 5,
      includePatterns: [],
      excludePatterns: [],
    },
  };
}

describe('pipeline', () => {
  describe('runPipeline', () => {
    it('should run passes in order', async () => {
      const order: string[] = [];

      const passA: AnalysisPass = {
        name: 'pass-a',
        description: 'First pass',
        dependencies: [],
        configKeys: [],
        async execute() {
          order.push('a');
        },
      };

      const passB: AnalysisPass = {
        name: 'pass-b',
        description: 'Second pass',
        dependencies: ['pass-a'],
        configKeys: [],
        async execute() {
          order.push('b');
        },
      };

      const passC: AnalysisPass = {
        name: 'pass-c',
        description: 'Third pass',
        dependencies: ['pass-b'],
        configKeys: [],
        async execute() {
          order.push('c');
        },
      };

      const registry = new PassRegistry();
      registry.register(passA);
      registry.register(passB);
      registry.register(passC);

      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/tmp/ws');
      const logger = createLogger('silent');

      await runPipeline(ctx, registry, logger);

      expect(order).toEqual(['a', 'b', 'c']);
    });

    it('should throw PassError when a pass fails', async () => {
      const failingPass: AnalysisPass = {
        name: 'failing-pass',
        description: 'A pass that fails',
        dependencies: [],
        configKeys: [],
        async execute() {
          throw new Error('something broke');
        },
      };

      const registry = new PassRegistry();
      registry.register(failingPass);

      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/tmp/ws');
      const logger = createLogger('silent');

      await expect(runPipeline(ctx, registry, logger)).rejects.toThrow(PassError);
      await expect(runPipeline(ctx, registry, logger)).rejects.toThrow(/failing-pass.*something broke/);
    });

    it('should not run passes after a failure', async () => {
      const order: string[] = [];

      const passA: AnalysisPass = {
        name: 'pass-a',
        description: 'First pass',
        dependencies: [],
        configKeys: [],
        async execute() {
          order.push('a');
          throw new Error('boom');
        },
      };

      const passB: AnalysisPass = {
        name: 'pass-b',
        description: 'Second pass',
        dependencies: ['pass-a'],
        configKeys: [],
        async execute() {
          order.push('b');
        },
      };

      const registry = new PassRegistry();
      registry.register(passA);
      registry.register(passB);

      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/tmp/ws');
      const logger = createLogger('silent');

      await expect(runPipeline(ctx, registry, logger)).rejects.toThrow(PassError);
      expect(order).toEqual(['a']);
    });

    it('should support passFilter to run only selected passes', async () => {
      const order: string[] = [];

      const passA: AnalysisPass = {
        name: 'pass-a',
        description: 'First pass',
        dependencies: [],
        configKeys: [],
        async execute() {
          order.push('a');
        },
      };

      const passB: AnalysisPass = {
        name: 'pass-b',
        description: 'Second pass',
        dependencies: [],
        configKeys: [],
        async execute() {
          order.push('b');
        },
      };

      const registry = new PassRegistry();
      registry.register(passA);
      registry.register(passB);

      const config = makeConfig();
      const ctx = createWorkspaceContext(config, '/tmp/ws');
      const logger = createLogger('silent');

      await runPipeline(ctx, registry, logger, { passFilter: ['pass-b'] });

      expect(order).toEqual(['b']);
    });
  });
});
