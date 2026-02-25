import { describe, it, expect } from 'vitest';
import { PassRegistry } from '../../src/core/pass-registry.js';
import { CtxifyError } from '../../src/core/errors.js';
import type { AnalysisPass } from '../../src/passes/types.js';

function makePass(name: string, dependencies: string[] = []): AnalysisPass {
  return {
    name,
    description: `${name} pass`,
    dependencies,
    configKeys: [],
    async execute() {},
  };
}

describe('PassRegistry', () => {
  describe('register and getAll', () => {
    it('should register a pass and retrieve it via getAll', () => {
      const registry = new PassRegistry();
      const pass = makePass('test-pass');

      registry.register(pass);

      const all = registry.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('test-pass');
    });

    it('should register multiple passes', () => {
      const registry = new PassRegistry();
      registry.register(makePass('pass-a'));
      registry.register(makePass('pass-b'));
      registry.register(makePass('pass-c'));

      expect(registry.getAll()).toHaveLength(3);
    });

    it('should throw when registering a duplicate pass name', () => {
      const registry = new PassRegistry();
      registry.register(makePass('dup'));

      expect(() => registry.register(makePass('dup'))).toThrow(CtxifyError);
      expect(() => registry.register(makePass('dup'))).toThrow(/already registered/);
    });

    it('should retrieve a pass by name via get()', () => {
      const registry = new PassRegistry();
      const pass = makePass('my-pass');
      registry.register(pass);

      expect(registry.get('my-pass')).toBe(pass);
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getOrdered', () => {
    it('should return passes in topological order', () => {
      const registry = new PassRegistry();
      registry.register(makePass('c', ['b']));
      registry.register(makePass('a', []));
      registry.register(makePass('b', ['a']));

      const ordered = registry.getOrdered();
      const names = ordered.map((p) => p.name);

      // 'a' must come before 'b', 'b' must come before 'c'
      expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'));
      expect(names.indexOf('b')).toBeLessThan(names.indexOf('c'));
    });

    it('should return passes with no dependencies in registration order', () => {
      const registry = new PassRegistry();
      registry.register(makePass('x', []));
      registry.register(makePass('y', []));
      registry.register(makePass('z', []));

      const ordered = registry.getOrdered();
      const names = ordered.map((p) => p.name);

      expect(names).toEqual(['x', 'y', 'z']);
    });

    it('should handle diamond dependencies', () => {
      const registry = new PassRegistry();
      registry.register(makePass('d', ['b', 'c']));
      registry.register(makePass('b', ['a']));
      registry.register(makePass('c', ['a']));
      registry.register(makePass('a', []));

      const ordered = registry.getOrdered();
      const names = ordered.map((p) => p.name);

      expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'));
      expect(names.indexOf('a')).toBeLessThan(names.indexOf('c'));
      expect(names.indexOf('b')).toBeLessThan(names.indexOf('d'));
      expect(names.indexOf('c')).toBeLessThan(names.indexOf('d'));
    });
  });

  describe('circular dependency detection', () => {
    it('should throw on direct circular dependency', () => {
      const registry = new PassRegistry();
      registry.register(makePass('a', ['b']));
      registry.register(makePass('b', ['a']));

      expect(() => registry.getOrdered()).toThrow(CtxifyError);
      expect(() => registry.getOrdered()).toThrow(/Circular dependency/);
    });

    it('should throw on indirect circular dependency', () => {
      const registry = new PassRegistry();
      registry.register(makePass('a', ['c']));
      registry.register(makePass('b', ['a']));
      registry.register(makePass('c', ['b']));

      expect(() => registry.getOrdered()).toThrow(CtxifyError);
      expect(() => registry.getOrdered()).toThrow(/Circular dependency/);
    });
  });

  describe('unknown dependency', () => {
    it('should throw when a pass depends on an unregistered pass', () => {
      const registry = new PassRegistry();
      registry.register(makePass('a', ['nonexistent']));

      expect(() => registry.getOrdered()).toThrow(CtxifyError);
      expect(() => registry.getOrdered()).toThrow(/Unknown pass dependency/);
    });
  });
});
