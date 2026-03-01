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

  it('returns unfilled nudge when overview.md has TODO markers', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(repoDir, 'overview.md'),
      '---\ntype: overview\n---\n\n# My App\n\n<!-- TODO: Describe the architecture -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toBe(
      'ctxify workspace detected. Context is unfilled. Invoke /ctxify-filling-context to document the codebase.',
    );
  });

  it('includes index.md content without frontmatter', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(tmpDir, '.ctxify', 'index.md'),
      '---\nmode: single-repo\n---\n\n# Workspace Overview\n\nThis is the workspace.',
      'utf-8',
    );
    writeFileSync(join(repoDir, 'overview.md'), '# My App\n\nA test application.', 'utf-8');

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('# Workspace Overview');
    expect(output).toContain('This is the workspace.');
    expect(output).not.toContain('mode: single-repo');
  });

  it('includes overview.md content when context is filled', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(
      join(repoDir, 'overview.md'),
      '---\ntype: overview\n---\n\n# My App\n\nA well-documented app.',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('# My App');
    expect(output).toContain('A well-documented app.');
    expect(output).not.toContain('type: overview');
  });

  it('includes corrections content when corrections.md exists', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'overview.md'), '# My App\n\nA test application.', 'utf-8');
    writeFileSync(
      join(repoDir, 'corrections.md'),
      '---\nrepo: my-app\ntype: corrections\n---\n\n# Corrections\n\n<!-- correction:2025-06-15 -->\nDo not use var.\n<!-- /correction -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('Do not use var.');
    expect(output).toContain('# Corrections');
  });

  it('includes rules content when rules.md exists', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'overview.md'), '# My App\n\nA test application.', 'utf-8');
    writeFileSync(
      join(repoDir, 'rules.md'),
      '---\nrepo: my-app\ntype: rules\n---\n\n# Rules\n\n<!-- rule:2025-06-15 -->\nDo not fragment CSS.\n<!-- /rule -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('Do not fragment CSS.');
    expect(output).toContain('# Rules');
  });

  it('includes footer line about patterns.md', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'overview.md'), '# My App\n\nA test application.', 'utf-8');

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain(
      'Load patterns.md before writing code. Load domain files when entering specific areas.',
    );
  });

  it('omits corrections section when corrections.md does not exist', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'overview.md'), '# My App\n\nA test application.', 'utf-8');

    const output = getContextHookOutput(tmpDir);
    expect(output).not.toContain('Corrections');
    expect(output).toContain('# My App');
  });

  it('handles multiple repos', () => {
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

    writeFileSync(join(apiDir, 'overview.md'), '# API\n\nThe API service.', 'utf-8');
    writeFileSync(join(webDir, 'overview.md'), '# Web\n\nThe web frontend.', 'utf-8');
    writeFileSync(
      join(apiDir, 'corrections.md'),
      '<!-- correction:2025-06-15 -->\nuse POST not PUT.\n<!-- /correction -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('# API');
    expect(output).toContain('# Web');
    expect(output).toContain('use POST not PUT.');
  });

  it('handles custom outputDir from ctx.yaml', () => {
    writeCtxYaml(tmpDir, { options: { outputDir: 'custom-ctx' } });
    const repoDir = join(tmpDir, 'custom-ctx', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'overview.md'), '# My App\n\nCustom dir app.', 'utf-8');
    writeFileSync(
      join(repoDir, 'corrections.md'),
      '<!-- correction:2025-06-15 -->\nCustom dir correction.\n<!-- /correction -->',
      'utf-8',
    );

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('Custom dir correction.');
    expect(output).toContain('# My App');
  });

  it('skips empty corrections.md files', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'overview.md'), '# My App\n\nA test app.', 'utf-8');
    writeFileSync(join(repoDir, 'corrections.md'), '', 'utf-8');

    const output = getContextHookOutput(tmpDir);
    expect(output).toContain('# My App');
    expect(output).not.toContain('Corrections');
  });

  it('returns empty string when repos dir has no overview files and no content', () => {
    writeCtxYaml(tmpDir);
    const repoDir = join(tmpDir, '.ctxify', 'repos', 'my-app');
    mkdirSync(repoDir, { recursive: true });
    // No files at all in the repo dir

    const output = getContextHookOutput(tmpDir);
    expect(output).toBe('');
  });
});
