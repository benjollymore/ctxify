import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../../src/core/config.js';
import { createWorkspaceContext } from '../../src/core/context.js';
import { PassRegistry } from '../../src/core/pass-registry.js';
import { runPipeline } from '../../src/core/pipeline.js';
import { createLogger } from '../../src/core/logger.js';
import { repoDetectionPass } from '../../src/passes/01-repo-detection.js';
import { manifestParsingPass } from '../../src/passes/02-manifest-parsing.js';
import { structureMappingPass } from '../../src/passes/03-structure-mapping.js';
import { apiDiscoveryPass } from '../../src/passes/04-api-discovery.js';
import { typeExtractionPass } from '../../src/passes/05-type-extraction.js';
import { envScanningPass } from '../../src/passes/06-env-scanning.js';
import { relationshipInferencePass } from '../../src/passes/07-relationship-inference.js';
import { conventionDetectionPass } from '../../src/passes/08-convention-detection.js';

const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'workspace-simple');

describe('integration: full generate pipeline', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeAll(() => {
    // Skip if fixture does not exist
    if (!existsSync(FIXTURE_DIR)) {
      return;
    }

    // Copy fixture to a temp directory so we can add a ctx.yaml without modifying the source tree
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-integration-'));
    workspaceDir = join(tmpDir, 'workspace');
    cpSync(FIXTURE_DIR, workspaceDir, { recursive: true });

    // Create a ctx.yaml pointing to the two repos
    const ctxYaml = `
version: "1"
workspace: "${workspaceDir}"
repos:
  - path: ./frontend
    name: frontend
  - path: ./api-server
    name: api-server
relationships: []
options:
  outputDir: .ctx
  maxFileSize: 100000
  maxDepth: 5
  excludePatterns:
    - node_modules
    - .git
    - dist
    - build
`;
    writeFileSync(join(workspaceDir, 'ctx.yaml'), ctxYaml, 'utf-8');
  });

  afterAll(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should run the full pipeline and populate context', async () => {
    if (!existsSync(FIXTURE_DIR)) {
      console.warn('Skipping integration test: fixture not found at', FIXTURE_DIR);
      return;
    }

    const configPath = join(workspaceDir, 'ctx.yaml');
    const config = loadConfig(configPath);
    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');

    const registry = new PassRegistry();
    registry.register(repoDetectionPass);
    registry.register(manifestParsingPass);
    registry.register(structureMappingPass);
    registry.register(apiDiscoveryPass);
    registry.register(typeExtractionPass);
    registry.register(envScanningPass);
    registry.register(relationshipInferencePass);
    registry.register(conventionDetectionPass);

    await runPipeline(ctx, registry, logger);

    // Assert repos were detected
    expect(ctx.repos).toHaveLength(2);
    const repoNames = ctx.repos.map((r) => r.name).sort();
    expect(repoNames).toEqual(['api-server', 'frontend']);

    // Assert manifest parsing filled in language and framework info
    const apiRepo = ctx.repos.find((r) => r.name === 'api-server');
    const frontendRepo = ctx.repos.find((r) => r.name === 'frontend');
    expect(apiRepo).toBeDefined();
    expect(frontendRepo).toBeDefined();
    expect(apiRepo!.language).toBe('typescript');
    expect(frontendRepo!.language).toBe('typescript');
    expect(apiRepo!.manifestType).toBe('package.json');
    expect(frontendRepo!.manifestType).toBe('package.json');

    // Assert API endpoints were discovered (the api-server has routes)
    // api-server has: GET /, POST /, GET /:id on usersRouter, and GET /health on app
    expect(ctx.apiEndpoints.length).toBeGreaterThanOrEqual(3);
    const apiMethods = ctx.apiEndpoints.map((e) => `${e.method} ${e.path}`);
    // There should be at least GET and POST routes
    expect(apiMethods.some((m) => m.startsWith('GET'))).toBe(true);
    expect(apiMethods.some((m) => m.startsWith('POST'))).toBe(true);

    // Assert shared types were discovered
    // UserProfile is defined in api-server and referenced in frontend
    expect(ctx.sharedTypes.length).toBeGreaterThanOrEqual(1);
    const userProfileType = ctx.sharedTypes.find((t) => t.name === 'UserProfile');
    expect(userProfileType).toBeDefined();

    // Assert env vars were discovered
    // api-server uses process.env.PORT, frontend uses process.env.API_URL
    expect(ctx.envVars.length).toBeGreaterThanOrEqual(1);
    const envVarNames = ctx.envVars.map((e) => e.name);
    expect(envVarNames).toContain('PORT');
    expect(envVarNames).toContain('API_URL');

    // Assert relationships were inferred
    expect(ctx.relationships.length).toBeGreaterThanOrEqual(1);
    // There should be at least an api-consumer relationship from frontend to api-server
    // since frontend fetches /api/users
    const apiConsumerRel = ctx.relationships.find(
      (r) => r.type === 'api-consumer' && r.from === 'frontend' && r.to === 'api-server',
    );
    expect(apiConsumerRel).toBeDefined();
  });

  it('should populate structure mapping data', async () => {
    if (!existsSync(FIXTURE_DIR)) {
      return;
    }

    const configPath = join(workspaceDir, 'ctx.yaml');
    const config = loadConfig(configPath);
    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');

    const registry = new PassRegistry();
    registry.register(repoDetectionPass);
    registry.register(manifestParsingPass);
    registry.register(structureMappingPass);
    registry.register(apiDiscoveryPass);
    registry.register(typeExtractionPass);
    registry.register(envScanningPass);
    registry.register(relationshipInferencePass);
    registry.register(conventionDetectionPass);

    await runPipeline(ctx, registry, logger);

    // api-server has a src directory with routes and models
    const apiRepo = ctx.repos.find((r) => r.name === 'api-server');
    expect(apiRepo).toBeDefined();
    expect(apiRepo!.keyDirs).toContain('src');
    expect(apiRepo!.entryPoints.length).toBeGreaterThanOrEqual(1);
    expect(apiRepo!.fileCount).toBeGreaterThan(0);

    // frontend has a src directory
    const frontendRepo = ctx.repos.find((r) => r.name === 'frontend');
    expect(frontendRepo).toBeDefined();
    expect(frontendRepo!.keyDirs).toContain('src');
    expect(frontendRepo!.fileCount).toBeGreaterThan(0);
  });

  it('should detect conventions when tooling files exist', async () => {
    if (!existsSync(FIXTURE_DIR)) {
      return;
    }

    // Add a tsconfig.json to api-server so the convention pass finds a tooling file
    writeFileSync(
      join(workspaceDir, 'api-server', 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { target: 'ES2022' } }),
      'utf-8',
    );

    const configPath = join(workspaceDir, 'ctx.yaml');
    const config = loadConfig(configPath);
    const ctx = createWorkspaceContext(config, workspaceDir);
    const logger = createLogger('silent');

    const registry = new PassRegistry();
    registry.register(repoDetectionPass);
    registry.register(manifestParsingPass);
    registry.register(structureMappingPass);
    registry.register(apiDiscoveryPass);
    registry.register(typeExtractionPass);
    registry.register(envScanningPass);
    registry.register(relationshipInferencePass);
    registry.register(conventionDetectionPass);

    await runPipeline(ctx, registry, logger);

    // Conventions should include at least the TypeScript tooling convention
    expect(ctx.conventions.length).toBeGreaterThanOrEqual(1);
    const toolingConventions = ctx.conventions.filter((c) => c.category === 'tooling');
    expect(toolingConventions.length).toBeGreaterThanOrEqual(1);
    expect(toolingConventions.some((c) => c.description.includes('TypeScript'))).toBe(true);
  });
});
