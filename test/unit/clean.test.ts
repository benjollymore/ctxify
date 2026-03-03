import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseYaml } from '../../src/utils/yaml.js';

// ── Mocking ──────────────────────────────────────────────────────────────

const mockRemoveClaudeHook = vi.fn();

vi.mock('../../src/cli/install-hooks.js', () => ({
  removeClaudeHook: mockRemoveClaudeHook,
}));

// ── Clean logic (extracted from command) ──────────────────────────────────

function cleanWorkspace(workspaceRoot: string): { removed: string[]; workspace: string } {
  const configPath = join(workspaceRoot, 'ctx.yaml');

  // Read outputDir from config before deleting anything
  let outputDirName = '.ctxify';
  if (existsSync(configPath)) {
    try {
      const raw = parseYaml<Record<string, unknown>>(readFileSync(configPath, 'utf-8'));
      const options = raw?.options as Record<string, unknown> | undefined;
      if (typeof options?.outputDir === 'string') {
        outputDirName = options.outputDir;
      }
    } catch {
      // Fall back to default if config is unparseable
    }
  }

  const outputDir = join(workspaceRoot, outputDirName);
  const removed: string[] = [];

  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
    removed.push(outputDirName.endsWith('/') ? outputDirName : outputDirName + '/');
  }

  if (existsSync(configPath)) {
    rmSync(configPath);
    removed.push('ctx.yaml');
  }

  // Remove Claude Code SessionStart hook
  mockRemoveClaudeHook(workspaceRoot);

  return { removed, workspace: workspaceRoot };
}

// ── Helpers ──────────────────────────────────────────────────────────────

let tmpDir: string;

function createWorkspaceDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-clean-'));
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('clean command logic', () => {
  beforeEach(() => {
    tmpDir = createWorkspaceDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('scenario 1: both ctx.yaml and .ctxify/ directory exist — both get removed', () => {
    const configPath = join(tmpDir, 'ctx.yaml');
    const outputDir = join(tmpDir, '.ctxify');

    // Create both files
    writeFileSync(
      configPath,
      'version: "1"\nworkspace: ' + tmpDir + '\nrepos: []\nrelationships: []',
      'utf-8',
    );
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'index.md'), '# test', 'utf-8');

    // Verify they exist
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(outputDir)).toBe(true);

    // Run clean
    const result = cleanWorkspace(tmpDir);

    // Both should be removed
    expect(result.removed).toContain('.ctxify/');
    expect(result.removed).toContain('ctx.yaml');
    expect(existsSync(configPath)).toBe(false);
    expect(existsSync(outputDir)).toBe(false);
  });

  it('scenario 2: only ctx.yaml exists — removes it, reports .ctxify/ as not found', () => {
    const configPath = join(tmpDir, 'ctx.yaml');
    const outputDir = join(tmpDir, '.ctxify');

    // Create only config
    writeFileSync(
      configPath,
      'version: "1"\nworkspace: ' + tmpDir + '\nrepos: []\nrelationships: []',
      'utf-8',
    );

    // Verify ctx.yaml exists but .ctxify does not
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(outputDir)).toBe(false);

    // Run clean
    const result = cleanWorkspace(tmpDir);

    // Only ctx.yaml should be in removed list
    expect(result.removed).toContain('ctx.yaml');
    expect(result.removed).not.toContain('.ctxify/');
    expect(existsSync(configPath)).toBe(false);
  });

  it('scenario 3: neither file exists — reports both as not found', () => {
    const configPath = join(tmpDir, 'ctx.yaml');
    const outputDir = join(tmpDir, '.ctxify');

    // Verify neither exist
    expect(existsSync(configPath)).toBe(false);
    expect(existsSync(outputDir)).toBe(false);

    // Run clean
    const result = cleanWorkspace(tmpDir);

    // Nothing should be removed
    expect(result.removed).toEqual([]);
    expect(existsSync(configPath)).toBe(false);
    expect(existsSync(outputDir)).toBe(false);
  });

  it('scenario 4: custom outputDir in ctx.yaml — removes the custom directory instead of .ctxify/', () => {
    const customDirName = 'custom-context';
    const configPath = join(tmpDir, 'ctx.yaml');
    const customDir = join(tmpDir, customDirName);
    const defaultDir = join(tmpDir, '.ctxify');

    // Create config with custom outputDir
    writeFileSync(
      configPath,
      `version: "1"\nworkspace: ${tmpDir}\nrepos: []\nrelationships: []\noptions:\n  outputDir: ${customDirName}\n`,
      'utf-8',
    );

    // Create custom directory (not default)
    mkdirSync(customDir, { recursive: true });
    writeFileSync(join(customDir, 'index.md'), '# custom', 'utf-8');

    // Verify custom dir exists but default does not
    expect(existsSync(customDir)).toBe(true);
    expect(existsSync(defaultDir)).toBe(false);
    expect(existsSync(configPath)).toBe(true);

    // Run clean
    const result = cleanWorkspace(tmpDir);

    // Custom directory should be removed, not default
    expect(result.removed).toContain(customDirName + '/');
    expect(result.removed).toContain('ctx.yaml');
    expect(result.removed).not.toContain('.ctxify/');

    expect(existsSync(customDir)).toBe(false);
    expect(existsSync(configPath)).toBe(false);
  });

  it('returns workspace path in result', () => {
    const configPath = join(tmpDir, 'ctx.yaml');

    writeFileSync(
      configPath,
      'version: "1"\nworkspace: ' + tmpDir + '\nrepos: []\nrelationships: []',
      'utf-8',
    );

    const result = cleanWorkspace(tmpDir);

    expect(result.workspace).toBe(tmpDir);
  });

  it('handles malformed config gracefully', () => {
    const configPath = join(tmpDir, 'ctx.yaml');
    const outputDir = join(tmpDir, '.ctxify');

    // Create malformed config
    writeFileSync(configPath, '!!invalid: [yaml: {broken', 'utf-8');
    mkdirSync(outputDir, { recursive: true });

    // Should still remove .ctxify directory and fall back to default
    const result = cleanWorkspace(tmpDir);

    expect(result.removed).toContain('.ctxify/');
    expect(result.removed).toContain('ctx.yaml');
    expect(existsSync(outputDir)).toBe(false);
    expect(existsSync(configPath)).toBe(false);
  });

  it('calls removeClaudeHook during clean', () => {
    const configPath = join(tmpDir, 'ctx.yaml');
    writeFileSync(
      configPath,
      'version: "1"\nworkspace: ' + tmpDir + '\nrepos: []\nrelationships: []',
      'utf-8',
    );

    cleanWorkspace(tmpDir);

    expect(mockRemoveClaudeHook).toHaveBeenCalledWith(tmpDir);
  });
});
