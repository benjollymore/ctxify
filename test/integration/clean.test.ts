/**
 * Integration tests for `ctxify clean` command.
 *
 * NOTE: These tests require building first.
 * Run as: npm run build && npx vitest run test/integration/clean.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
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

describe('integration: ctxify clean', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(prefix = 'ctxify-clean-'): string {
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

  it('removes .ctxify/ and ctx.yaml after init', () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'clean-app', version: '1.0.0' }),
      'utf-8',
    );

    // Init first
    runCli(['init'], dir);
    expect(existsSync(join(dir, 'ctx.yaml'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify'))).toBe(true);

    // Clean
    const { stdout, exitCode } = runCli(['clean'], dir);
    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout.trim());
    expect(output.removed).toContain('.ctxify/');
    expect(output.removed).toContain('ctx.yaml');

    expect(existsSync(join(dir, 'ctx.yaml'))).toBe(false);
    expect(existsSync(join(dir, '.ctxify'))).toBe(false);
  });

  it('succeeds when nothing exists to clean', () => {
    const dir = makeTmpDir();

    const { stdout, exitCode } = runCli(['clean'], dir);
    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout.trim());
    expect(output.removed).toEqual([]);
  });

  it('respects custom outputDir from ctx.yaml', () => {
    const dir = makeTmpDir();

    // Manually create a config with custom outputDir
    const customDir = 'custom-context';
    writeFileSync(
      join(dir, 'ctx.yaml'),
      `version: "1"\nworkspace: ${dir}\nmode: single-repo\nrepos:\n  - path: .\n    name: test\nrelationships: []\noptions:\n  outputDir: ${customDir}\n`,
      'utf-8',
    );
    mkdirSync(join(dir, customDir), { recursive: true });
    writeFileSync(join(dir, customDir, 'index.md'), '# test\n', 'utf-8');

    // Clean should remove custom dir
    const { stdout, exitCode } = runCli(['clean'], dir);
    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout.trim());
    expect(output.removed).toContain(customDir + '/');
    expect(output.removed).toContain('ctx.yaml');

    expect(existsSync(join(dir, customDir))).toBe(false);
    expect(existsSync(join(dir, 'ctx.yaml'))).toBe(false);
  });
});
