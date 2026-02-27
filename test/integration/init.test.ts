/**
 * Integration tests for `ctxify init` command.
 *
 * NOTE: These tests require building first.
 * Run as: npm run build && npx vitest run test/integration/init.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI_PATH = join(__dirname, '..', '..', 'dist', 'bin', 'ctxify.js');

function runCli(args: string[], cwd: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 30_000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout || '') + (e.stderr || ''),
      exitCode: e.status ?? 1,
    };
  }
}

function createPackageJson(dir: string, name: string, extras: Record<string, unknown> = {}): void {
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      { name, version: '1.0.0', description: `The ${name} package`, ...extras },
      null,
      2,
    ),
    'utf-8',
  );
}

describe('integration: ctxify init', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(prefix = 'ctxify-init-'): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('single-repo: creates ctx.yaml and .ctxify shards', () => {
    const dir = makeTmpDir();
    createPackageJson(dir, 'my-app', {
      dependencies: { express: '^4.0.0' },
      devDependencies: { typescript: '^5.0.0' },
      scripts: { build: 'tsc', test: 'vitest' },
    });

    // Create a minimal source file so fileCount > 0
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'index.ts'), 'export const x = 1;\n', 'utf-8');

    const { stdout, exitCode } = runCli(['init'], dir);
    expect(exitCode).toBe(0);

    // Parse JSON output
    const output = JSON.parse(stdout.trim());
    expect(output.status).toBe('initialized');
    expect(output.mode).toBe('single-repo');
    expect(output.shards_written).toBe(true);

    // ctx.yaml created
    expect(existsSync(join(dir, 'ctx.yaml'))).toBe(true);

    // .ctxify shards created
    expect(existsSync(join(dir, '.ctxify', 'index.md'))).toBe(true);

    // Repo overview in new structure
    const repoName = output.repos[0];
    expect(existsSync(join(dir, '.ctxify', 'repos', repoName, 'overview.md'))).toBe(true);

    // Old shard dirs should NOT exist
    expect(existsSync(join(dir, '.ctxify', '_analysis.md'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'endpoints'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'types'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'env'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'topology'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify', 'questions'))).toBe(false);
  });

  it('multi-repo with --repos: creates shards for each repo', () => {
    const dir = makeTmpDir();

    // Create api/ and web/ subdirs each with package.json
    const apiDir = join(dir, 'api');
    const webDir = join(dir, 'web');
    mkdirSync(apiDir, { recursive: true });
    mkdirSync(webDir, { recursive: true });
    createPackageJson(apiDir, 'api', {
      dependencies: { express: '^4.0.0' },
      devDependencies: { typescript: '^5.0.0' },
    });
    createPackageJson(webDir, 'web', {
      dependencies: { react: '^18.0.0' },
      devDependencies: { typescript: '^5.0.0' },
    });

    const { stdout, exitCode } = runCli(['init', '--repos', './api', './web'], dir);
    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout.trim());
    expect(output.status).toBe('initialized');
    expect(output.mode).toBe('multi-repo');

    // ctx.yaml lists both repos
    const ctxYaml = readFileSync(join(dir, 'ctx.yaml'), 'utf-8');
    expect(ctxYaml).toContain('api');
    expect(ctxYaml).toContain('web');

    // Per-repo overviews in new structure
    expect(existsSync(join(dir, '.ctxify', 'repos', 'api', 'overview.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'web', 'overview.md'))).toBe(true);

    // Old structure should NOT exist
    expect(existsSync(join(dir, '.ctxify', 'endpoints'))).toBe(false);
  });

  it('refuses without --force when ctx.yaml exists', () => {
    const dir = makeTmpDir();
    createPackageJson(dir, 'existing-app');
    writeFileSync(join(dir, 'ctx.yaml'), 'version: "1"\n', 'utf-8');

    const { exitCode } = runCli(['init'], dir);
    expect(exitCode).not.toBe(0);
  });

  it('force overwrites existing ctx.yaml', () => {
    const dir = makeTmpDir();
    createPackageJson(dir, 'force-app', {
      dependencies: { express: '^4.0.0' },
    });
    writeFileSync(join(dir, 'ctx.yaml'), 'version: "1"\n', 'utf-8');

    const { stdout, exitCode } = runCli(['init', '--force'], dir);
    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout.trim());
    expect(output.status).toBe('initialized');
  });

  it('ensures .ctxify/ is in .gitignore', () => {
    const dir = makeTmpDir();
    createPackageJson(dir, 'gitignore-app');

    runCli(['init'], dir);

    const gitignorePath = join(dir, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.ctxify/');
  });

  it('preserves existing .gitignore entries', () => {
    const dir = makeTmpDir();
    createPackageJson(dir, 'preserve-app');
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n', 'utf-8');

    runCli(['init'], dir);

    const content = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    expect(content).toContain('.ctxify/');
  });
});
