import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../../src/core/config.js';
import { createWorkspaceContext } from '../../src/core/context.js';
import { PassRegistry } from '../../src/core/pass-registry.js';
import { runPipeline, runPipelineParallel } from '../../src/core/pipeline.js';
import { createLogger } from '../../src/core/logger.js';
import { loadCache } from '../../src/core/cache.js';
import { computeStaleness } from '../../src/core/differ.js';
import { parseYaml } from '../../src/utils/yaml.js';
import { writeShards } from '../../src/core/shard-writer.js';
import { indexYamlRenderer } from '../../src/renderers/index-yaml.js';
import { shardReposRenderer } from '../../src/renderers/shard-repos.js';
import { shardEndpointsRenderer } from '../../src/renderers/shard-endpoints.js';
import { shardTypesRenderer } from '../../src/renderers/shard-types.js';
import { shardEnvRenderer } from '../../src/renderers/shard-env.js';
import { shardTopologyRenderer } from '../../src/renderers/shard-topology.js';
import { repoDetectionPass } from '../../src/passes/01-repo-detection.js';
import { manifestParsingPass } from '../../src/passes/02-manifest-parsing.js';
import { structureMappingPass } from '../../src/passes/03-structure-mapping.js';
import { apiDiscoveryPass } from '../../src/passes/04-api-discovery.js';
import { typeExtractionPass } from '../../src/passes/05-type-extraction.js';
import { envScanningPass } from '../../src/passes/06-env-scanning.js';
import { relationshipInferencePass } from '../../src/passes/07-relationship-inference.js';
import { conventionDetectionPass } from '../../src/passes/08-convention-detection.js';

const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'workspace-simple');
const MONOREPO_FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'workspace-monorepo');

function createCtxYaml(workspaceDir: string): string {
  return `
version: "1"
workspace: "${workspaceDir}"
repos:
  - path: ./frontend
    name: frontend
  - path: ./api-server
    name: api-server
relationships: []
options:
  outputDir: .ctxify
  maxFileSize: 100000
  maxDepth: 5
  excludePatterns:
    - node_modules
    - .git
    - dist
    - build
`;
}

function registerAllPasses(registry: PassRegistry): void {
  registry.register(repoDetectionPass);
  registry.register(manifestParsingPass);
  registry.register(structureMappingPass);
  registry.register(apiDiscoveryPass);
  registry.register(typeExtractionPass);
  registry.register(envScanningPass);
  registry.register(relationshipInferencePass);
  registry.register(conventionDetectionPass);
}

describe('integration: full scan pipeline', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeAll(() => {
    if (!existsSync(FIXTURE_DIR)) return;

    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-integration-'));
    workspaceDir = join(tmpDir, 'workspace');
    cpSync(FIXTURE_DIR, workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, 'ctx.yaml'), createCtxYaml(workspaceDir), 'utf-8');
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should run the full pipeline and populate context', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');
    const registry = new PassRegistry();
    registerAllPasses(registry);

    await runPipeline(ctx, registry, logger);

    expect(ctx.repos).toHaveLength(2);
    expect(ctx.repos.map((r) => r.name).sort()).toEqual(['api-server', 'frontend']);

    const apiRepo = ctx.repos.find((r) => r.name === 'api-server');
    expect(apiRepo).toBeDefined();
    expect(apiRepo!.language).toBe('typescript');
    expect(apiRepo!.manifestType).toBe('package.json');

    expect(ctx.apiEndpoints.length).toBeGreaterThanOrEqual(3);
    expect(ctx.apiEndpoints.some((e) => e.method === 'GET')).toBe(true);
    expect(ctx.apiEndpoints.some((e) => e.method === 'POST')).toBe(true);

    expect(ctx.sharedTypes.length).toBeGreaterThanOrEqual(1);
    expect(ctx.sharedTypes.find((t) => t.name === 'UserProfile')).toBeDefined();

    expect(ctx.envVars.length).toBeGreaterThanOrEqual(1);
    expect(ctx.envVars.map((e) => e.name)).toContain('PORT');
    expect(ctx.envVars.map((e) => e.name)).toContain('API_URL');

    expect(ctx.relationships.length).toBeGreaterThanOrEqual(1);
    expect(ctx.relationships.find(
      (r) => r.type === 'api-consumer' && r.from === 'frontend' && r.to === 'api-server',
    )).toBeDefined();
  });

  it('should populate structure mapping data', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');
    const registry = new PassRegistry();
    registerAllPasses(registry);

    await runPipeline(ctx, registry, logger);

    const apiRepo = ctx.repos.find((r) => r.name === 'api-server');
    expect(apiRepo).toBeDefined();
    expect(apiRepo!.keyDirs).toContain('src');
    expect(apiRepo!.entryPoints.length).toBeGreaterThanOrEqual(1);
    expect(apiRepo!.fileCount).toBeGreaterThan(0);

    const frontendRepo = ctx.repos.find((r) => r.name === 'frontend');
    expect(frontendRepo).toBeDefined();
    expect(frontendRepo!.keyDirs).toContain('src');
    expect(frontendRepo!.fileCount).toBeGreaterThan(0);
  });
});

describe('integration: shard writers produce correct output', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeAll(async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-shards-'));
    workspaceDir = join(tmpDir, 'workspace');
    cpSync(FIXTURE_DIR, workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, 'ctx.yaml'), createCtxYaml(workspaceDir), 'utf-8');
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  async function runFullPipeline() {
    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');
    const registry = new PassRegistry();
    registerAllPasses(registry);
    await runPipeline(ctx, registry, logger);
    return ctx;
  }

  it('writeShards creates expected directory structure', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const ctx = await runFullPipeline();
    const outputDir = '.ctxify';
    writeShards(ctx, workspaceDir, outputDir);

    // index.yaml
    expect(existsSync(join(workspaceDir, outputDir, 'index.yaml'))).toBe(true);

    // repos/
    expect(existsSync(join(workspaceDir, outputDir, 'repos', 'api-server.yaml'))).toBe(true);
    expect(existsSync(join(workspaceDir, outputDir, 'repos', 'frontend.yaml'))).toBe(true);

    // endpoints/ (api-server has endpoints)
    expect(existsSync(join(workspaceDir, outputDir, 'endpoints', 'api-server.yaml'))).toBe(true);

    // types/
    expect(existsSync(join(workspaceDir, outputDir, 'types', 'shared.yaml'))).toBe(true);

    // env/
    expect(existsSync(join(workspaceDir, outputDir, 'env', 'all.yaml'))).toBe(true);

    // topology/
    expect(existsSync(join(workspaceDir, outputDir, 'topology', 'graph.yaml'))).toBe(true);

    // questions/
    expect(existsSync(join(workspaceDir, outputDir, 'questions', 'pending.yaml'))).toBe(true);
  });

  it('index.yaml has correct structure and counts', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const ctx = await runFullPipeline();
    const output = indexYamlRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      ctxify: string;
      repos: Array<{ name: string }>;
      totals: { repos: number; endpoints: number; shared_types: number; env_vars: number };
      shards: Record<string, string>;
    };

    expect(parsed.ctxify).toBe('2.0');
    expect(parsed.repos).toHaveLength(2);
    expect(parsed.repos.map((r) => r.name).sort()).toEqual(['api-server', 'frontend']);
    expect(parsed.totals.repos).toBe(2);
    expect(parsed.totals.endpoints).toBeGreaterThanOrEqual(3);
    expect(parsed.totals.shared_types).toBeGreaterThanOrEqual(1);
    expect(parsed.totals.env_vars).toBeGreaterThanOrEqual(1);
    expect(parsed.shards).toBeDefined();
    expect(parsed.shards.repos).toBe('.ctxify/repos/{name}.yaml');
  });

  it('shard-repos produces valid YAML for each repo', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const ctx = await runFullPipeline();
    const files = shardReposRenderer.renderAll(ctx);

    expect(files.size).toBe(2);

    for (const [path, content] of files) {
      expect(path).toMatch(/\.ctxify\/repos\/[\w-]+\.yaml$/);
      const parsed = parseYaml<Record<string, unknown>>(content);
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('path');
      expect(parsed).toHaveProperty('language');
      expect(parsed).toHaveProperty('scripts');
      expect(parsed).toHaveProperty('dependencies');
    }
  });

  it('shard-endpoints produces valid YAML for repos with endpoints', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const ctx = await runFullPipeline();
    const files = shardEndpointsRenderer.renderAll(ctx);

    expect(files.size).toBeGreaterThanOrEqual(1);

    for (const [path, content] of files) {
      expect(path).toMatch(/\.ctxify\/endpoints\/[\w-]+\.yaml$/);
      const parsed = parseYaml<Record<string, unknown>>(content) as {
        repo: string;
        endpoints: Array<{ method: string; path: string }>;
      };
      expect(parsed).toHaveProperty('repo');
      expect(parsed).toHaveProperty('endpoints');
      expect(parsed.endpoints.length).toBeGreaterThan(0);
      for (const ep of parsed.endpoints) {
        expect(ep).toHaveProperty('method');
        expect(ep).toHaveProperty('path');
        expect(ep).toHaveProperty('handler');
      }
    }
  });

  it('shard-types produces valid YAML with shared types', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const ctx = await runFullPipeline();
    const output = shardTypesRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      shared_types: Array<{ name: string; kind: string; defined_in: string }>;
    };

    expect(parsed.shared_types.length).toBeGreaterThanOrEqual(1);
    expect(parsed.shared_types.find((t) => t.name === 'UserProfile')).toBeDefined();
  });

  it('shard-env produces valid YAML with env vars', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const ctx = await runFullPipeline();
    const output = shardEnvRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      env_vars: Array<{ name: string; repos: string[] }>;
    };

    expect(parsed.env_vars.length).toBeGreaterThanOrEqual(1);
    expect(parsed.env_vars.map((e) => e.name)).toContain('PORT');
    expect(parsed.env_vars.map((e) => e.name)).toContain('API_URL');
  });

  it('shard-topology produces valid YAML with edges', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const ctx = await runFullPipeline();
    const output = shardTopologyRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output) as {
      repos: Array<{ name: string }>;
      edges: Array<{ from: string; to: string; type: string }>;
    };

    expect(parsed.repos).toHaveLength(2);
    expect(parsed.edges.length).toBeGreaterThanOrEqual(1);
  });
});

describe('integration: parallel pipeline produces same results as sequential', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeAll(async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-parallel-'));
    workspaceDir = join(tmpDir, 'workspace');
    cpSync(FIXTURE_DIR, workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, 'ctx.yaml'), createCtxYaml(workspaceDir), 'utf-8');
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should produce identical context via parallel and sequential pipelines', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    const logger = createLogger('silent');

    // Sequential
    const seqCtx = createWorkspaceContext(config, workspaceDir);
    const seqRegistry = new PassRegistry();
    registerAllPasses(seqRegistry);
    await runPipeline(seqCtx, seqRegistry, logger);

    // Parallel
    const parCtx = createWorkspaceContext(config, workspaceDir);
    const parRegistry = new PassRegistry();
    registerAllPasses(parRegistry);
    await runPipelineParallel(parCtx, parRegistry, logger);

    expect(parCtx.repos.map((r) => r.name).sort()).toEqual(
      seqCtx.repos.map((r) => r.name).sort(),
    );
    expect(parCtx.apiEndpoints.length).toBe(seqCtx.apiEndpoints.length);
    expect(parCtx.sharedTypes.length).toBe(seqCtx.sharedTypes.length);
    expect(parCtx.envVars.length).toBe(seqCtx.envVars.length);
    expect(parCtx.relationships.length).toBe(seqCtx.relationships.length);

    // Compare rendered shard output (excluding timestamps)
    const seqIndex = parseYaml<Record<string, unknown>>(indexYamlRenderer.render(seqCtx));
    const parIndex = parseYaml<Record<string, unknown>>(indexYamlRenderer.render(parCtx));
    delete seqIndex['scanned_at'];
    delete parIndex['scanned_at'];
    expect(parIndex).toEqual(seqIndex);
  });
});

import { generateDefaultConfig, serializeConfig } from '../../src/core/config.js';

describe('integration: mono-repo mode scan', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeAll(() => {
    if (!existsSync(MONOREPO_FIXTURE_DIR)) return;

    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-monorepo-'));
    workspaceDir = join(tmpDir, 'workspace');
    cpSync(MONOREPO_FIXTURE_DIR, workspaceDir, { recursive: true });

    // Write mono-repo ctx.yaml
    const config = generateDefaultConfig(workspaceDir, [
      { path: 'packages/shared', name: '@myapp/shared' },
      { path: 'packages/web', name: '@myapp/web' },
      { path: 'packages/api', name: '@myapp/api' },
    ], 'mono-repo', { manager: 'npm', packageGlobs: ['packages/*'] });
    writeFileSync(join(workspaceDir, 'ctx.yaml'), serializeConfig(config), 'utf-8');
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect mono-repo packages and run pipeline', async () => {
    if (!existsSync(MONOREPO_FIXTURE_DIR)) return;

    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    expect(config.mode).toBe('mono-repo');
    expect(config.monoRepo).toBeDefined();
    expect(config.monoRepo!.manager).toBe('npm');

    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');
    const registry = new PassRegistry();
    registerAllPasses(registry);

    await runPipeline(ctx, registry, logger);

    expect(ctx.repos).toHaveLength(3);
    expect(ctx.repos.map((r) => r.name).sort()).toEqual(['@myapp/api', '@myapp/shared', '@myapp/web']);
  });

  it('should include mode in index.yaml output', async () => {
    if (!existsSync(MONOREPO_FIXTURE_DIR)) return;

    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');
    const registry = new PassRegistry();
    registerAllPasses(registry);

    await runPipeline(ctx, registry, logger);

    const output = indexYamlRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output);
    expect(parsed.mode).toBe('mono-repo');
  });
});

describe('integration: single-repo mode scan', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeAll(() => {
    if (!existsSync(FIXTURE_DIR)) return;

    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-singlerepo-'));
    workspaceDir = join(tmpDir, 'workspace');

    // Use just the api-server as a single repo
    cpSync(join(FIXTURE_DIR, 'api-server'), workspaceDir, { recursive: true });

    // Write single-repo ctx.yaml
    const config = generateDefaultConfig(workspaceDir, [
      { path: '.', name: 'api-server' },
    ], 'single-repo');
    writeFileSync(join(workspaceDir, 'ctx.yaml'), serializeConfig(config), 'utf-8');
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should run in single-repo mode with no cross-repo inference', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    expect(config.mode).toBe('single-repo');

    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');
    const registry = new PassRegistry();
    registerAllPasses(registry);

    await runPipeline(ctx, registry, logger);

    expect(ctx.repos).toHaveLength(1);
    expect(ctx.repos[0].name).toBe('api-server');

    // Single-repo mode: no cross-repo relationships inferred
    expect(ctx.relationships.length).toBe(0);
  });

  it('should include mode in index.yaml output', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');
    const registry = new PassRegistry();
    registerAllPasses(registry);

    await runPipeline(ctx, registry, logger);

    const output = indexYamlRenderer.render(ctx);
    const parsed = parseYaml<Record<string, unknown>>(output);
    expect(parsed.mode).toBe('single-repo');
  });
});

describe('integration: staleness check', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeAll(() => {
    if (!existsSync(FIXTURE_DIR)) return;

    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-status-'));
    workspaceDir = join(tmpDir, 'workspace');
    cpSync(FIXTURE_DIR, workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, 'ctx.yaml'), createCtxYaml(workspaceDir), 'utf-8');
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should report all repos as stale when no cache exists', async () => {
    if (!existsSync(FIXTURE_DIR)) return;

    const config = loadConfig(join(workspaceDir, 'ctx.yaml'));
    const outputDir = config.options.outputDir || '.ctxify';
    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');

    const registry = new PassRegistry();
    registry.register(repoDetectionPass);
    await runPipeline(ctx, registry, logger);

    const cache = loadCache(workspaceDir, outputDir);
    const staleness = await computeStaleness(ctx, cache);

    expect(staleness.isFullyFresh).toBe(false);
    expect(staleness.staleRepos.length).toBeGreaterThan(0);
  });
});
