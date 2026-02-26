import { describe, it, expect } from 'vitest';
import { runPipelineParallel } from '../../src/core/pipeline.js';
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
      outputDir: '.ctxify',
      maxFileSize: 100_000,
      maxDepth: 5,
      includePatterns: [],
      excludePatterns: [],
    },
  };
}

describe('PassRegistry.getLevels', () => {
  function makePass(name: string, dependencies: string[] = []): AnalysisPass {
    return {
      name,
      description: `${name} pass`,
      dependencies,
      configKeys: [],
      async execute() {},
    };
  }

  it('should return a single level for passes with no dependencies', () => {
    const registry = new PassRegistry();
    registry.register(makePass('a'));
    registry.register(makePass('b'));
    registry.register(makePass('c'));

    const levels = registry.getLevels();
    expect(levels).toHaveLength(1);
    expect(levels[0].map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });

  it('should return multiple levels for a linear chain', () => {
    const registry = new PassRegistry();
    registry.register(makePass('a'));
    registry.register(makePass('b', ['a']));
    registry.register(makePass('c', ['b']));

    const levels = registry.getLevels();
    expect(levels).toHaveLength(3);
    expect(levels[0].map((p) => p.name)).toEqual(['a']);
    expect(levels[1].map((p) => p.name)).toEqual(['b']);
    expect(levels[2].map((p) => p.name)).toEqual(['c']);
  });

  it('should group independent passes at the same level', () => {
    const registry = new PassRegistry();
    registry.register(makePass('root'));
    registry.register(makePass('a', ['root']));
    registry.register(makePass('b', ['root']));
    registry.register(makePass('c', ['root']));

    const levels = registry.getLevels();
    expect(levels).toHaveLength(2);
    expect(levels[0].map((p) => p.name)).toEqual(['root']);
    expect(levels[1].map((p) => p.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it('should handle the ctxify pass graph correctly', () => {
    const registry = new PassRegistry();
    registry.register(makePass('repo-detection'));
    registry.register(makePass('manifest-parsing', ['repo-detection']));
    registry.register(makePass('structure-mapping', ['repo-detection']));
    registry.register(makePass('env-scanning', ['repo-detection']));
    registry.register(makePass('api-discovery', ['repo-detection', 'manifest-parsing']));
    registry.register(makePass('type-extraction', ['repo-detection', 'manifest-parsing']));
    registry.register(makePass('convention-detection', ['repo-detection', 'structure-mapping']));
    registry.register(makePass('relationship-inference', ['repo-detection', 'manifest-parsing', 'api-discovery', 'env-scanning']));

    const levels = registry.getLevels();
    expect(levels).toHaveLength(4);

    expect(levels[0].map((p) => p.name)).toEqual(['repo-detection']);
    expect(levels[1].map((p) => p.name).sort()).toEqual(['env-scanning', 'manifest-parsing', 'structure-mapping']);
    expect(levels[2].map((p) => p.name).sort()).toEqual(['api-discovery', 'convention-detection', 'type-extraction']);
    expect(levels[3].map((p) => p.name)).toEqual(['relationship-inference']);
  });

  it('should handle diamond dependencies', () => {
    const registry = new PassRegistry();
    registry.register(makePass('a'));
    registry.register(makePass('b', ['a']));
    registry.register(makePass('c', ['a']));
    registry.register(makePass('d', ['b', 'c']));

    const levels = registry.getLevels();
    expect(levels).toHaveLength(3);
    expect(levels[0].map((p) => p.name)).toEqual(['a']);
    expect(levels[1].map((p) => p.name).sort()).toEqual(['b', 'c']);
    expect(levels[2].map((p) => p.name)).toEqual(['d']);
  });
});

describe('runPipelineParallel', () => {
  it('should run all passes and complete', async () => {
    const order: string[] = [];

    const passA: AnalysisPass = {
      name: 'pass-a',
      description: 'First',
      dependencies: [],
      configKeys: [],
      async execute() {
        order.push('a');
      },
    };

    const passB: AnalysisPass = {
      name: 'pass-b',
      description: 'Second',
      dependencies: ['pass-a'],
      configKeys: [],
      async execute() {
        order.push('b');
      },
    };

    const registry = new PassRegistry();
    registry.register(passA);
    registry.register(passB);

    const ctx = createWorkspaceContext(makeConfig(), '/tmp/ws');
    const logger = createLogger('silent');

    await runPipelineParallel(ctx, registry, logger);

    expect(order).toContain('a');
    expect(order).toContain('b');
    // 'a' must come before 'b' since they are on different levels
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
  });

  it('should run independent passes concurrently within a level', async () => {
    const startTimes: Record<string, number> = {};
    const endTimes: Record<string, number> = {};

    const makeTimedPass = (name: string, deps: string[], delayMs: number): AnalysisPass => ({
      name,
      description: name,
      dependencies: deps,
      configKeys: [],
      async execute() {
        startTimes[name] = Date.now();
        await new Promise((r) => setTimeout(r, delayMs));
        endTimes[name] = Date.now();
      },
    });

    const registry = new PassRegistry();
    registry.register(makeTimedPass('root', [], 10));
    registry.register(makeTimedPass('a', ['root'], 50));
    registry.register(makeTimedPass('b', ['root'], 50));

    const ctx = createWorkspaceContext(makeConfig(), '/tmp/ws');
    const logger = createLogger('silent');

    await runPipelineParallel(ctx, registry, logger);

    // 'a' and 'b' should have started at roughly the same time (after root)
    expect(startTimes['a']).toBeGreaterThanOrEqual(endTimes['root']);
    expect(startTimes['b']).toBeGreaterThanOrEqual(endTimes['root']);
    // Both should start within a small window of each other (concurrent)
    expect(Math.abs(startTimes['a'] - startTimes['b'])).toBeLessThan(30);
  });

  it('should throw PassError on first failure', async () => {
    const passA: AnalysisPass = {
      name: 'pass-a',
      description: 'Failing',
      dependencies: [],
      configKeys: [],
      async execute() {
        throw new Error('boom');
      },
    };

    const registry = new PassRegistry();
    registry.register(passA);

    const ctx = createWorkspaceContext(makeConfig(), '/tmp/ws');
    const logger = createLogger('silent');

    await expect(runPipelineParallel(ctx, registry, logger)).rejects.toThrow(PassError);
    await expect(runPipelineParallel(ctx, registry, logger)).rejects.toThrow(/pass-a.*boom/);
  });

  it('should not run later levels if an earlier level fails', async () => {
    const order: string[] = [];

    const passA: AnalysisPass = {
      name: 'pass-a',
      description: 'Fails',
      dependencies: [],
      configKeys: [],
      async execute() {
        order.push('a');
        throw new Error('boom');
      },
    };

    const passB: AnalysisPass = {
      name: 'pass-b',
      description: 'Should not run',
      dependencies: ['pass-a'],
      configKeys: [],
      async execute() {
        order.push('b');
      },
    };

    const registry = new PassRegistry();
    registry.register(passA);
    registry.register(passB);

    const ctx = createWorkspaceContext(makeConfig(), '/tmp/ws');
    const logger = createLogger('silent');

    await expect(runPipelineParallel(ctx, registry, logger)).rejects.toThrow(PassError);
    expect(order).toEqual(['a']);
  });
});
