import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, generateDefaultConfig, serializeConfig } from '../../src/core/config.js';
import { ConfigError } from '../../src/core/errors.js';

describe('config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-config-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadConfig', () => {
    it('should load a valid YAML config', () => {
      const yamlContent = `
version: "1"
workspace: /tmp/my-workspace
repos:
  - path: ./frontend
    name: frontend
    language: typescript
  - path: ./api
    name: api
    language: typescript
relationships:
  - from: frontend
    to: api
    type: api-consumer
    description: Frontend calls API
options:
  outputDir: .ctx
  maxFileSize: 50000
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      const config = loadConfig(configPath);

      expect(config.version).toBe('1');
      expect(config.workspace).toBe('/tmp/my-workspace');
      expect(config.repos).toHaveLength(2);
      expect(config.repos[0].name).toBe('frontend');
      expect(config.repos[0].path).toBe('./frontend');
      expect(config.repos[0].language).toBe('typescript');
      expect(config.repos[1].name).toBe('api');
      expect(config.relationships).toHaveLength(1);
      expect(config.relationships[0].type).toBe('api-consumer');
      expect(config.options.outputDir).toBe('.ctx');
      expect(config.options.maxFileSize).toBe(50000);
    });

    it('should load a minimal valid config with defaults', () => {
      const yamlContent = `
version: "1"
workspace: /tmp/ws
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      const config = loadConfig(configPath);

      expect(config.version).toBe('1');
      expect(config.workspace).toBe('/tmp/ws');
      expect(config.repos).toEqual([]);
      expect(config.relationships).toEqual([]);
      expect(config.options.outputDir).toBe('.ctx');
      expect(config.options.maxFileSize).toBe(100_000);
      expect(config.options.maxDepth).toBe(5);
      expect(config.options.excludePatterns).toContain('node_modules');
      expect(config.options.excludePatterns).toContain('.git');
    });

    it('should throw ConfigError for missing file', () => {
      const missingPath = join(tmpDir, 'does-not-exist.yaml');

      expect(() => loadConfig(missingPath)).toThrow(ConfigError);
      expect(() => loadConfig(missingPath)).toThrow(/Config file not found/);
    });

    it('should throw ConfigError for invalid YAML', () => {
      const configPath = join(tmpDir, 'bad.yaml');
      writeFileSync(configPath, '!!invalid: [yaml: {broken', 'utf-8');

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
    });
  });

  describe('validateConfig', () => {
    it('should reject config missing version field', () => {
      const yamlContent = `
workspace: /tmp/ws
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
      expect(() => loadConfig(configPath)).toThrow(/version/);
    });

    it('should reject config missing workspace field', () => {
      const yamlContent = `
version: "1"
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
      expect(() => loadConfig(configPath)).toThrow(/workspace/);
    });

    it('should reject repos that is not an array', () => {
      const yamlContent = `
version: "1"
workspace: /tmp/ws
repos: "not-an-array"
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
      expect(() => loadConfig(configPath)).toThrow(/repos.*array/i);
    });

    it('should reject repo entry without path', () => {
      const yamlContent = `
version: "1"
workspace: /tmp/ws
repos:
  - name: frontend
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
      expect(() => loadConfig(configPath)).toThrow(/path/);
    });

    it('should reject repo entry without name', () => {
      const yamlContent = `
version: "1"
workspace: /tmp/ws
repos:
  - path: ./frontend
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
      expect(() => loadConfig(configPath)).toThrow(/name/);
    });
  });

  describe('mode validation', () => {
    it('should default mode to multi-repo when absent (backward compat)', () => {
      const yamlContent = `
version: "1"
workspace: /tmp/ws
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      const config = loadConfig(configPath);
      expect(config.mode).toBe('multi-repo');
    });

    it('should accept valid mode values', () => {
      for (const mode of ['single-repo', 'multi-repo', 'mono-repo']) {
        const yamlContent = `
version: "1"
workspace: /tmp/ws
mode: ${mode}
`;
        const configPath = join(tmpDir, `ctx-${mode}.yaml`);
        writeFileSync(configPath, yamlContent, 'utf-8');

        const config = loadConfig(configPath);
        expect(config.mode).toBe(mode);
      }
    });

    it('should reject invalid mode values', () => {
      const yamlContent = `
version: "1"
workspace: /tmp/ws
mode: invalid-mode
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      expect(() => loadConfig(configPath)).toThrow(ConfigError);
      expect(() => loadConfig(configPath)).toThrow(/mode/);
    });

    it('should accept monoRepo options for mono-repo mode', () => {
      const yamlContent = `
version: "1"
workspace: /tmp/ws
mode: mono-repo
monoRepo:
  manager: npm
  packageGlobs:
    - "packages/*"
    - "apps/*"
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      const config = loadConfig(configPath);
      expect(config.mode).toBe('mono-repo');
      expect(config.monoRepo).toBeDefined();
      expect(config.monoRepo!.manager).toBe('npm');
      expect(config.monoRepo!.packageGlobs).toEqual(['packages/*', 'apps/*']);
    });

    it('should ignore monoRepo options for non-mono-repo modes', () => {
      const yamlContent = `
version: "1"
workspace: /tmp/ws
mode: multi-repo
monoRepo:
  manager: npm
`;
      const configPath = join(tmpDir, 'ctx.yaml');
      writeFileSync(configPath, yamlContent, 'utf-8');

      const config = loadConfig(configPath);
      expect(config.mode).toBe('multi-repo');
      expect(config.monoRepo).toBeUndefined();
    });
  });

  describe('generateDefaultConfig', () => {
    it('should produce a valid config', () => {
      const repos = [
        { path: './frontend', name: 'frontend' },
        { path: './api', name: 'api' },
      ];
      const config = generateDefaultConfig('/tmp/workspace', repos);

      expect(config.version).toBe('1');
      expect(config.workspace).toBe('/tmp/workspace');
      expect(config.mode).toBe('multi-repo');
      expect(config.repos).toHaveLength(2);
      expect(config.repos[0].name).toBe('frontend');
      expect(config.repos[1].name).toBe('api');
      expect(config.relationships).toEqual([]);
      expect(config.options.outputDir).toBe('.ctx');
      expect(config.options.maxFileSize).toBe(100_000);
      expect(config.options.maxDepth).toBe(5);
    });

    it('should accept explicit mode parameter', () => {
      const repos = [{ path: '.', name: 'myrepo' }];
      const config = generateDefaultConfig('/tmp/ws', repos, 'single-repo');

      expect(config.mode).toBe('single-repo');
    });

    it('should include monoRepo options when provided', () => {
      const repos = [{ path: 'packages/a', name: 'a' }];
      const config = generateDefaultConfig('/tmp/ws', repos, 'mono-repo', {
        manager: 'pnpm',
        packageGlobs: ['packages/*'],
      });

      expect(config.mode).toBe('mono-repo');
      expect(config.monoRepo).toBeDefined();
      expect(config.monoRepo!.manager).toBe('pnpm');
    });

    it('should produce config that roundtrips through serialize and load', () => {
      const repos = [{ path: './myrepo', name: 'myrepo' }];
      const config = generateDefaultConfig('/tmp/ws', repos);

      const serialized = serializeConfig(config);
      const configPath = join(tmpDir, 'roundtrip.yaml');
      writeFileSync(configPath, serialized, 'utf-8');

      const loaded = loadConfig(configPath);
      expect(loaded.version).toBe(config.version);
      expect(loaded.workspace).toBe(config.workspace);
      expect(loaded.mode).toBe(config.mode);
      expect(loaded.repos).toHaveLength(config.repos.length);
      expect(loaded.repos[0].name).toBe(config.repos[0].name);
    });

    it('should roundtrip mono-repo config with monoRepo options', () => {
      const repos = [{ path: 'packages/core', name: 'core' }];
      const config = generateDefaultConfig('/tmp/ws', repos, 'mono-repo', {
        manager: 'turborepo',
        packageGlobs: ['packages/*'],
      });

      const serialized = serializeConfig(config);
      const configPath = join(tmpDir, 'roundtrip-mono.yaml');
      writeFileSync(configPath, serialized, 'utf-8');

      const loaded = loadConfig(configPath);
      expect(loaded.mode).toBe('mono-repo');
      expect(loaded.monoRepo).toBeDefined();
      expect(loaded.monoRepo!.manager).toBe('turborepo');
      expect(loaded.monoRepo!.packageGlobs).toEqual(['packages/*']);
    });
  });
});
