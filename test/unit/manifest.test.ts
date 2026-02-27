import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRepoManifest } from '../../src/core/manifest.js';

describe('parseRepoManifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-manifest-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should parse a TypeScript package.json repo', () => {
    // Create package.json
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'my-app',
        description: 'A test application',
        main: './dist/index.js',
        bin: { 'my-app': './dist/bin/cli.js' },
        scripts: {
          build: 'tsup',
          test: 'vitest run',
        },
        dependencies: {
          express: '^4.18.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          vitest: '^2.0.0',
        },
      }),
      'utf-8',
    );

    // Create source files so entry point resolution works
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'index.ts'), 'export default {};', 'utf-8');
    mkdirSync(join(tmpDir, 'src', 'bin'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'bin', 'cli.ts'), 'console.log("cli");', 'utf-8');

    const result = parseRepoManifest(tmpDir);

    expect(result.language).toBe('typescript');
    expect(result.framework).toBe('express');
    expect(result.description).toBe('A test application');
    expect(result.manifestType).toBe('package.json');
    expect(result.dependencies).toEqual({ express: '^4.18.0' });
    expect(result.devDependencies).toEqual({ typescript: '^5.0.0', vitest: '^2.0.0' });
    expect(result.scripts).toEqual({ build: 'tsup', test: 'vitest run' });
    expect(result.entryPoints).toContain('src/index.ts');
    expect(result.entryPoints).toContain('src/bin/cli.ts');
    expect(result.keyDirs.length).toBeGreaterThan(0);
    expect(result.keyDirs).toContain('src');
    expect(result.fileCount).toBeGreaterThan(0);
  });

  it('should return empty defaults for repo with no manifest', () => {
    // Empty directory — no manifest files at all
    const result = parseRepoManifest(tmpDir);

    expect(result.language).toBe('');
    expect(result.framework).toBe('');
    expect(result.description).toBe('');
    expect(result.manifestType).toBe('');
    expect(result.dependencies).toEqual({});
    expect(result.devDependencies).toEqual({});
    expect(result.scripts).toEqual({});
    expect(result.entryPoints).toEqual([]);
    expect(result.keyDirs).toEqual([]);
    expect(result.fileCount).toBe(0);
  });

  it('should detect Python with pyproject.toml', () => {
    const pyprojectContent = `
[project]
name = "my-api"
version = "0.1.0"
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.23.0",
]

[project.scripts]
serve = "my_api.main:app"
`;
    writeFileSync(join(tmpDir, 'pyproject.toml'), pyprojectContent, 'utf-8');

    // Create the module file so entry point resolution finds it
    mkdirSync(join(tmpDir, 'my_api'), { recursive: true });
    writeFileSync(join(tmpDir, 'my_api', 'main.py'), 'app = None', 'utf-8');

    const result = parseRepoManifest(tmpDir);

    expect(result.language).toBe('python');
    expect(result.framework).toBe('fastapi');
    expect(result.manifestType).toBe('pyproject.toml');
    expect(result.entryPoints).toContain('my_api/main.py');
    expect(result.keyDirs).toContain('my_api');
    expect(result.fileCount).toBeGreaterThan(0);
  });

  it('should detect Python with requirements.txt fallback', () => {
    writeFileSync(join(tmpDir, 'requirements.txt'), 'flask>=2.0.0\nrequests>=2.28.0\n', 'utf-8');

    const result = parseRepoManifest(tmpDir);

    expect(result.language).toBe('python');
    expect(result.framework).toBe('flask');
    expect(result.manifestType).toBe('requirements.txt');
  });

  it('should detect Go with go.mod', () => {
    const goModContent = `module github.com/example/myservice

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
)
`;
    writeFileSync(join(tmpDir, 'go.mod'), goModContent, 'utf-8');
    writeFileSync(join(tmpDir, 'main.go'), 'package main\nfunc main() {}', 'utf-8');

    const result = parseRepoManifest(tmpDir);

    expect(result.language).toBe('go');
    expect(result.framework).toBe('gin');
    expect(result.manifestType).toBe('go.mod');
    expect(result.entryPoints).toContain('main.go');
    expect(result.fileCount).toBeGreaterThan(0);
  });
});
