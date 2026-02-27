import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectMonoRepo } from '../../src/utils/monorepo.js';

describe('monorepo detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-monorepo-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect npm workspaces from package.json', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'my-monorepo',
        workspaces: ['packages/*'],
      }),
    );
    mkdirSync(join(tmpDir, 'packages', 'core'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'packages', 'core', 'package.json'),
      JSON.stringify({
        name: '@my/core',
        description: 'Core package',
      }),
    );
    mkdirSync(join(tmpDir, 'packages', 'web'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'packages', 'web', 'package.json'),
      JSON.stringify({
        name: '@my/web',
        dependencies: { typescript: '^5.0.0' },
      }),
    );

    const result = detectMonoRepo(tmpDir);

    expect(result.detected).toBe(true);
    expect(result.manager).toBe('npm');
    expect(result.packageGlobs).toEqual(['packages/*']);
    expect(result.packages).toHaveLength(2);
    expect(result.packages.map((p) => p.name).sort()).toEqual(['@my/core', '@my/web']);
  });

  it('should detect yarn workspaces with yarn.lock present', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'my-monorepo',
        workspaces: ['packages/*'],
      }),
    );
    writeFileSync(join(tmpDir, 'yarn.lock'), '');
    mkdirSync(join(tmpDir, 'packages', 'lib'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'packages', 'lib', 'package.json'),
      JSON.stringify({
        name: '@my/lib',
      }),
    );

    const result = detectMonoRepo(tmpDir);

    expect(result.detected).toBe(true);
    expect(result.manager).toBe('yarn');
  });

  it('should detect turborepo with turbo.json present', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'my-turborepo',
        workspaces: ['apps/*', 'packages/*'],
      }),
    );
    writeFileSync(join(tmpDir, 'turbo.json'), JSON.stringify({ pipeline: {} }));
    mkdirSync(join(tmpDir, 'apps', 'web'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'apps', 'web', 'package.json'),
      JSON.stringify({
        name: '@my/web-app',
      }),
    );
    mkdirSync(join(tmpDir, 'packages', 'ui'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'packages', 'ui', 'package.json'),
      JSON.stringify({
        name: '@my/ui',
      }),
    );

    const result = detectMonoRepo(tmpDir);

    expect(result.detected).toBe(true);
    expect(result.manager).toBe('turborepo');
    expect(result.packageGlobs).toEqual(['apps/*', 'packages/*']);
    expect(result.packages).toHaveLength(2);
  });

  it('should detect pnpm workspaces from pnpm-workspace.yaml', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'root' }));
    writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    mkdirSync(join(tmpDir, 'packages', 'core'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'packages', 'core', 'package.json'),
      JSON.stringify({
        name: '@my/core',
      }),
    );

    const result = detectMonoRepo(tmpDir);

    expect(result.detected).toBe(true);
    expect(result.manager).toBe('pnpm');
    expect(result.packageGlobs).toEqual(['packages/*']);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].name).toBe('@my/core');
  });

  it('should detect workspaces with object syntax { packages: [...] }', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'root',
        workspaces: { packages: ['modules/*'] },
      }),
    );
    mkdirSync(join(tmpDir, 'modules', 'alpha'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'modules', 'alpha', 'package.json'),
      JSON.stringify({
        name: 'alpha',
      }),
    );

    const result = detectMonoRepo(tmpDir);

    expect(result.detected).toBe(true);
    expect(result.packageGlobs).toEqual(['modules/*']);
    expect(result.packages).toHaveLength(1);
  });

  it('should return not detected when no workspace indicators', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'just-a-regular-project',
      }),
    );

    const result = detectMonoRepo(tmpDir);

    expect(result.detected).toBe(false);
    expect(result.manager).toBe(null);
    expect(result.packages).toEqual([]);
  });

  it('should return not detected when no package.json at all', () => {
    const result = detectMonoRepo(tmpDir);

    expect(result.detected).toBe(false);
    expect(result.packages).toEqual([]);
  });

  it('should handle empty globs that match no packages', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'root',
        workspaces: ['nonexistent/*'],
      }),
    );

    const result = detectMonoRepo(tmpDir);

    expect(result.detected).toBe(false);
    expect(result.packages).toEqual([]);
  });

  it('should detect language from tsconfig.json', () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'root',
        workspaces: ['packages/*'],
      }),
    );
    mkdirSync(join(tmpDir, 'packages', 'ts-lib'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'packages', 'ts-lib', 'package.json'),
      JSON.stringify({
        name: 'ts-lib',
      }),
    );
    writeFileSync(join(tmpDir, 'packages', 'ts-lib', 'tsconfig.json'), '{}');

    const result = detectMonoRepo(tmpDir);

    expect(result.packages[0].language).toBe('typescript');
  });

  it('should use existing workspace-monorepo fixture', () => {
    const fixturePath = join(__dirname, '..', 'fixtures', 'workspace-monorepo');
    const result = detectMonoRepo(fixturePath);

    expect(result.detected).toBe(true);
    expect(result.manager).toBe('npm');
    expect(result.packageGlobs).toEqual(['packages/*']);
    expect(result.packages.length).toBe(3);
    expect(result.packages.map((p) => p.name).sort()).toEqual([
      '@myapp/api',
      '@myapp/shared',
      '@myapp/web',
    ]);
  });
});
