import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateMultiRepoShards } from '../../src/core/validate.js';
import { generateDefaultConfig } from '../../src/core/config.js';
import type { CtxConfig } from '../../src/core/config.js';

describe('validateMultiRepoShards', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-validate-multi-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeConfig(
    repos: Array<{ path: string; name: string }>,
    primaryRepo?: string,
  ): CtxConfig {
    return generateDefaultConfig(
      tmpDir,
      repos,
      'multi-repo',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      primaryRepo,
    );
  }

  it('passes when all per-repo .ctxify/ directories have overview.md', () => {
    const config = makeConfig(
      [
        { path: 'api', name: 'api' },
        { path: 'web', name: 'web' },
      ],
      'api',
    );

    const apiCtx = join(tmpDir, 'api', '.ctxify');
    const webCtx = join(tmpDir, 'web', '.ctxify');
    mkdirSync(apiCtx, { recursive: true });
    mkdirSync(webCtx, { recursive: true });

    writeFileSync(join(apiCtx, 'overview.md'), '---\ntype: overview\n---\n\n# API', 'utf-8');
    writeFileSync(join(webCtx, 'overview.md'), '---\ntype: overview\n---\n\n# Web', 'utf-8');
    writeFileSync(join(apiCtx, 'workspace.md'), '---\ntype: workspace\n---\n\n# WS', 'utf-8');

    const result = validateMultiRepoShards(tmpDir, config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when per-repo overview.md is missing', () => {
    const config = makeConfig([{ path: 'api', name: 'api' }], 'api');

    const apiCtx = join(tmpDir, 'api', '.ctxify');
    mkdirSync(apiCtx, { recursive: true });
    // No overview.md

    const result = validateMultiRepoShards(tmpDir, config);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('api/.ctxify/overview.md not found')]),
    );
  });

  it('warns when workspace.md is missing in primary repo', () => {
    const config = makeConfig([{ path: 'api', name: 'api' }], 'api');

    const apiCtx = join(tmpDir, 'api', '.ctxify');
    mkdirSync(apiCtx, { recursive: true });
    writeFileSync(join(apiCtx, 'overview.md'), '---\ntype: overview\n---\n\n# API', 'utf-8');
    // No workspace.md

    const result = validateMultiRepoShards(tmpDir, config);
    expect(result.valid).toBe(true); // warning, not error
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('workspace.md not found')]),
    );
  });

  it('detects unmatched segment markers in per-repo files', () => {
    const config = makeConfig([{ path: 'api', name: 'api' }], 'api');

    const apiCtx = join(tmpDir, 'api', '.ctxify');
    mkdirSync(apiCtx, { recursive: true });
    writeFileSync(
      join(apiCtx, 'overview.md'),
      '---\ntype: overview\n---\n\n# API\n\n<!-- domain-index -->\n- `auth.md`\n',
      'utf-8',
    );
    writeFileSync(join(apiCtx, 'workspace.md'), '---\ntype: workspace\n---\n\n# WS', 'utf-8');

    const result = validateMultiRepoShards(tmpDir, config);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('unmatched segment marker')]),
    );
  });

  it('detects missing domain files referenced in per-repo overview', () => {
    const config = makeConfig([{ path: 'api', name: 'api' }], 'api');

    const apiCtx = join(tmpDir, 'api', '.ctxify');
    mkdirSync(apiCtx, { recursive: true });
    writeFileSync(
      join(apiCtx, 'overview.md'),
      '---\ntype: overview\n---\n\n# API\n\n<!-- domain-index -->\n- `auth.md` — Auth domain\n<!-- /domain-index -->',
      'utf-8',
    );
    writeFileSync(join(apiCtx, 'workspace.md'), '---\ntype: workspace\n---\n\n# WS', 'utf-8');
    // auth.md does NOT exist

    const result = validateMultiRepoShards(tmpDir, config);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('domain file referenced')]),
    );
  });

  it('reports TODO warnings in per-repo files', () => {
    const config = makeConfig([{ path: 'api', name: 'api' }], 'api');

    const apiCtx = join(tmpDir, 'api', '.ctxify');
    mkdirSync(apiCtx, { recursive: true });
    writeFileSync(
      join(apiCtx, 'overview.md'),
      '---\ntype: overview\n---\n\n# API\n\n<!-- TODO: fill this in -->',
      'utf-8',
    );
    writeFileSync(join(apiCtx, 'workspace.md'), '---\ntype: workspace\n---\n\n# WS', 'utf-8');

    const result = validateMultiRepoShards(tmpDir, config);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('TODO marker')]),
    );
  });
});
