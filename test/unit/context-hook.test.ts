import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getContextHookOutput } from '../../src/cli/commands/context-hook.js';
import { serializeConfig, generateDefaultConfig } from '../../src/core/config.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-context-hook-'));
}

function writeCtxYaml(dir: string, overrides: Record<string, unknown> = {}): void {
  const config = generateDefaultConfig(dir, [{ path: '.', name: 'my-app' }], 'single-repo');
  const raw = { ...JSON.parse(JSON.stringify(config)), ...overrides };
  writeFileSync(join(dir, 'ctx.yaml'), serializeConfig(raw as typeof config), 'utf-8');
}

describe('getContextHookOutput', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty string when no ctx.yaml exists', () => {
    const output = getContextHookOutput(tmpDir);
    expect(output).toBe('');
  });

  it('returns empty string when no repos directory exists', () => {
    writeCtxYaml(tmpDir);
    // .ctxify/ exists but no repos/ dir
    mkdirSync(join(tmpDir, '.ctxify'), { recursive: true });

    const output = getContextHookOutput(tmpDir);
    expect(output).toBe('');
  });

  it('outputs nudge message when repos dir exists but no corrections', () => {
    writeCtxYaml(tmpDir);
    mkdirSync(join(tmpDir, '.ctxify', 'repos', 'my-app'), { recursive: true });

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('/ctxify-reading-context');
    expect(output).toContain('ctxify workspace detected');
  });

  it('outputs corrections content when corrections.md exists', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(repoDir, 'corrections.md'),
      '---\nrepo: my-app\ntype: corrections\n---\n\n# Corrections\n\nDo not use var.',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('Do not use var.');
    expect(output).toContain('/ctxify-reading-context');
  });

  it('handles multiple repos with corrections', () => {
    writeCtxYaml(tmpDir, {
      repos: [
        { path: 'api', name: 'api' },
        { path: 'web', name: 'web' },
      ],
    });

    const apiDir = join(tmpDir, '.ctxify', 'repos', 'api');
    const webDir = join(tmpDir, '.ctxify', 'repos', 'web');
    mkdirSync(apiDir, { recursive: true });
    mkdirSync(webDir, { recursive: true });

    writeFileSync(join(apiDir, 'corrections.md'), 'API correction: use POST not PUT.', 'utf-8');
    writeFileSync(
      join(webDir, 'corrections.md'),
      'Web correction: prefer flex over grid.',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('API correction: use POST not PUT.');
    expect(output).toContain('Web correction: prefer flex over grid.');
    expect(output).toContain('/ctxify-reading-context');
  });

  it('handles custom outputDir from ctx.yaml', () => {
    writeCtxYaml(tmpDir, { options: { outputDir: 'custom-ctx' } });
    const repoDir = join(tmpDir, 'custom-ctx', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'corrections.md'), 'Custom dir correction.', 'utf-8');

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('Custom dir correction.');
    expect(output).toContain('/ctxify-reading-context');
  });

  it('skips repos without corrections.md', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    // Only overview.md, no corrections.md
    writeFileSync(join(repoDir, 'overview.md'), '# My App', 'utf-8');

    const output = getContextHookOutput(tmpDir);
    // Should only have the nudge, no corrections content
    expect(output).toBe(
      'ctxify workspace detected. Invoke /ctxify-reading-context to load patterns and domain context before starting work.',
    );
  });

  it('skips empty corrections.md files', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'corrections.md'), '', 'utf-8');

    const output = getContextHookOutput(tmpDir);
    // Should only have the nudge, no empty corrections
    expect(output).toBe(
      'ctxify workspace detected. Invoke /ctxify-reading-context to load patterns and domain context before starting work.',
    );
  });
});
