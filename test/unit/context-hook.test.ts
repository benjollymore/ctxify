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
    expect(output).toContain('Invoke /ctxify to');
    expect(output).toContain('ctxify workspace detected');
  });

  it('outputs summary when corrections.md has entries', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(repoDir, 'corrections.md'),
      '---\nrepo: my-app\ntype: corrections\n---\n\n# Corrections\n\n<!-- correction:2025-06-15 -->\nDo not use var.\n<!-- /correction -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('my-app (1 correction)');
    expect(output).not.toContain('Do not use var.');
    expect(output).toContain('Invoke /ctxify to');
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

    writeFileSync(
      join(apiDir, 'corrections.md'),
      '<!-- correction:2025-06-15 -->\nuse POST not PUT.\n<!-- /correction -->\n<!-- correction:2025-06-16 -->\nuse v2 API.\n<!-- /correction -->',
      'utf-8',
    );
    writeFileSync(
      join(webDir, 'corrections.md'),
      '<!-- correction:2025-06-15 -->\nprefer flex over grid.\n<!-- /correction -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('api (2 corrections)');
    expect(output).toContain('web (1 correction)');
    expect(output).not.toContain('use POST not PUT');
    expect(output).toContain('Invoke /ctxify to');
  });

  it('handles custom outputDir from ctx.yaml', () => {
    writeCtxYaml(tmpDir, { options: { outputDir: 'custom-ctx' } });
    const repoDir = join(tmpDir, 'custom-ctx', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(repoDir, 'corrections.md'),
      '<!-- correction:2025-06-15 -->\nCustom dir correction.\n<!-- /correction -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('my-app (1 correction)');
    expect(output).not.toContain('Custom dir correction.');
    expect(output).toContain('Invoke /ctxify to');
  });

  it('outputs summary when rules.md has entries', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(repoDir, 'rules.md'),
      '---\nrepo: my-app\ntype: rules\n---\n\n# Rules\n\n<!-- rule:2025-06-15 -->\nDo not fragment CSS.\n<!-- /rule -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('my-app (1 rule)');
    expect(output).not.toContain('Do not fragment CSS.');
    expect(output).toContain('Invoke /ctxify to');
  });

  it('outputs summary with both corrections and rules when both exist', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(repoDir, 'corrections.md'),
      '---\nrepo: my-app\ntype: corrections\n---\n\n# Corrections\n\n<!-- correction:2025-06-15 -->\nAPI is at /v2.\n<!-- /correction -->',
      'utf-8',
    );
    writeFileSync(
      join(repoDir, 'rules.md'),
      '---\nrepo: my-app\ntype: rules\n---\n\n# Rules\n\n<!-- rule:2025-06-15 -->\nAlways use bun.\n<!-- /rule -->\n<!-- antipattern:2025-06-16 -->\nDo not use var.\n<!-- /antipattern -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('my-app (1 correction, 2 rules)');
    expect(output).not.toContain('API is at /v2.');
    expect(output).not.toContain('Always use bun.');
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
      'ctxify workspace detected. Invoke /ctxify to load codebase context before coding.',
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
      'ctxify workspace detected. Invoke /ctxify to load codebase context before coding.',
    );
  });
});
