/**
 * Integration tests for `ctxify status` command.
 *
 * NOTE: These tests require building first.
 * Run as: npm run build && npx vitest run test/integration/status.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
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

describe('integration: ctxify status', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(prefix = 'ctxify-status-'): string {
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

  it('reports has_config: false when no ctx.yaml exists', () => {
    const dir = makeTmpDir();

    const { stdout, exitCode } = runCli(['status'], dir);
    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout.trim());
    expect(output.has_config).toBe(false);
  });

  it('reports full status after init', () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'test-app', version: '1.0.0' }),
      'utf-8',
    );
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'index.ts'), 'export default {};\n', 'utf-8');

    // Init first
    const initResult = runCli(['init'], dir);
    expect(initResult.exitCode).toBe(0);

    // Then status
    const { stdout, exitCode } = runCli(['status'], dir);
    expect(exitCode).toBe(0);

    const output = JSON.parse(stdout.trim());
    expect(output.has_config).toBe(true);
    expect(output.index_exists).toBe(true);
    expect(output.repos).toBeInstanceOf(Array);
    expect(output.repos.length).toBeGreaterThan(0);
    expect(typeof output.todo_count).toBe('number');
    expect(output.todo_count).toBeGreaterThan(0); // scaffolded templates have TODOs
  });
});
