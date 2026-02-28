import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  mergeHookIntoSettings,
  removeHookFromSettings,
  installClaudeHook,
  removeClaudeHook,
} from '../../src/cli/install-hooks.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-hooks-'));
}

describe('mergeHookIntoSettings', () => {
  it('creates settings from scratch when null', () => {
    const result = JSON.parse(mergeHookIntoSettings(null, 'ctxify context-hook'));
    expect(result.hooks.SessionStart).toEqual([
      { type: 'command', command: 'ctxify context-hook', matcher: 'startup|resume|compact' },
    ]);
  });

  it('preserves existing fields', () => {
    const existing = JSON.stringify({ permissions: { allow: ['Read'] } });
    const result = JSON.parse(mergeHookIntoSettings(existing, 'ctxify context-hook'));
    expect(result.permissions).toEqual({ allow: ['Read'] });
    expect(result.hooks.SessionStart).toHaveLength(1);
  });

  it('preserves non-ctxify hooks', () => {
    const existing = JSON.stringify({
      hooks: {
        SessionStart: [{ type: 'command', command: 'echo hello', matcher: 'startup' }],
      },
    });
    const result = JSON.parse(mergeHookIntoSettings(existing, 'ctxify context-hook'));
    expect(result.hooks.SessionStart).toHaveLength(2);
    expect(result.hooks.SessionStart[0].command).toBe('echo hello');
    expect(result.hooks.SessionStart[1].command).toBe('ctxify context-hook');
  });

  it('replaces existing ctxify hook (idempotent)', () => {
    const existing = JSON.stringify({
      hooks: {
        SessionStart: [
          { type: 'command', command: 'echo hello' },
          { type: 'command', command: 'ctxify context-hook', matcher: 'startup' },
        ],
      },
    });
    const result = JSON.parse(mergeHookIntoSettings(existing, 'npx ctxify context-hook'));
    expect(result.hooks.SessionStart).toHaveLength(2);
    expect(result.hooks.SessionStart[0].command).toBe('echo hello');
    expect(result.hooks.SessionStart[1].command).toBe('npx ctxify context-hook');
    expect(result.hooks.SessionStart[1].matcher).toBe('startup|resume|compact');
  });

  it('handles malformed JSON gracefully', () => {
    const result = JSON.parse(mergeHookIntoSettings('{bad json', 'ctxify context-hook'));
    expect(result.hooks.SessionStart).toHaveLength(1);
  });

  it('preserves other hook types', () => {
    const existing = JSON.stringify({
      hooks: {
        PreToolUse: [{ type: 'command', command: 'lint' }],
      },
    });
    const result = JSON.parse(mergeHookIntoSettings(existing, 'ctxify context-hook'));
    expect(result.hooks.PreToolUse).toEqual([{ type: 'command', command: 'lint' }]);
    expect(result.hooks.SessionStart).toHaveLength(1);
  });
});

describe('removeHookFromSettings', () => {
  it('removes ctxify entry and preserves others', () => {
    const existing = JSON.stringify({
      hooks: {
        SessionStart: [
          { type: 'command', command: 'echo hello' },
          { type: 'command', command: 'ctxify context-hook' },
        ],
      },
    });
    const result = JSON.parse(removeHookFromSettings(existing)!);
    expect(result.hooks.SessionStart).toEqual([{ type: 'command', command: 'echo hello' }]);
  });

  it('cleans up empty SessionStart array', () => {
    const existing = JSON.stringify({
      hooks: {
        SessionStart: [{ type: 'command', command: 'ctxify context-hook' }],
      },
    });
    const result = JSON.parse(removeHookFromSettings(existing)!);
    expect(result.hooks).toBeUndefined();
  });

  it('preserves other hook types when SessionStart becomes empty', () => {
    const existing = JSON.stringify({
      hooks: {
        SessionStart: [{ type: 'command', command: 'ctxify context-hook' }],
        PreToolUse: [{ type: 'command', command: 'lint' }],
      },
    });
    const result = JSON.parse(removeHookFromSettings(existing)!);
    expect(result.hooks.SessionStart).toBeUndefined();
    expect(result.hooks.PreToolUse).toEqual([{ type: 'command', command: 'lint' }]);
  });

  it('returns existing JSON unchanged when no ctxify hook exists', () => {
    const existing = JSON.stringify({
      hooks: {
        SessionStart: [{ type: 'command', command: 'echo hello' }],
      },
    });
    const result = removeHookFromSettings(existing);
    const parsed = JSON.parse(result!);
    expect(parsed.hooks.SessionStart).toEqual([{ type: 'command', command: 'echo hello' }]);
  });

  it('returns null for malformed JSON', () => {
    expect(removeHookFromSettings('{bad')).toBeNull();
  });

  it('returns existing JSON when no SessionStart hooks exist', () => {
    const existing = JSON.stringify({ permissions: { allow: ['Read'] } });
    const result = removeHookFromSettings(existing);
    expect(result).toBe(existing);
  });
});

describe('installClaudeHook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates settings.json with hook entry for global install', () => {
    const cmd = installClaudeHook(tmpDir, 'global');
    expect(cmd).toBe('ctxify context-hook');

    const settingsPath = join(tmpDir, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks.SessionStart).toEqual([
      { type: 'command', command: 'ctxify context-hook', matcher: 'startup|resume|compact' },
    ]);
  });

  it('uses npx ctxify for local install method', () => {
    const cmd = installClaudeHook(tmpDir, 'local');
    expect(cmd).toBe('npx ctxify context-hook');
  });

  it('uses npx @benjollymore/ctxify for npx install method', () => {
    const cmd = installClaudeHook(tmpDir, 'npx');
    expect(cmd).toBe('npx @benjollymore/ctxify context-hook');
  });

  it('installs to global scope path when scope is global', () => {
    const fakeHome = makeTmpDir();

    const cmd = installClaudeHook(tmpDir, 'global', 'global', fakeHome);
    expect(cmd).toBe('ctxify context-hook');

    const globalSettingsPath = join(fakeHome, '.claude', 'settings.json');
    expect(existsSync(globalSettingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(globalSettingsPath, 'utf-8'));
    expect(settings.hooks.SessionStart).toHaveLength(1);

    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('preserves existing settings.json content', () => {
    const settingsDir = join(tmpDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read'] } }),
      'utf-8',
    );

    installClaudeHook(tmpDir, 'global');

    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions).toEqual({ allow: ['Read'] });
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  it('is idempotent — updates existing ctxify hook', () => {
    installClaudeHook(tmpDir, 'global');
    installClaudeHook(tmpDir, 'local'); // should replace, not add

    const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.SessionStart[0].command).toBe('npx ctxify context-hook');
  });
});

describe('removeClaudeHook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes ctxify hook from workspace settings.json', () => {
    // Install first
    installClaudeHook(tmpDir, 'global');

    // Remove
    removeClaudeHook(tmpDir);

    const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks).toBeUndefined();
  });

  it('preserves other hooks when removing ctxify entry', () => {
    const settingsDir = join(tmpDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { type: 'command', command: 'echo hello' },
            { type: 'command', command: 'ctxify context-hook' },
          ],
        },
      }),
      'utf-8',
    );

    removeClaudeHook(tmpDir);

    const settings = JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf-8'));
    expect(settings.hooks.SessionStart).toEqual([{ type: 'command', command: 'echo hello' }]);
  });

  it('no-op when no settings.json exists', () => {
    // Should not throw
    removeClaudeHook(tmpDir);
    expect(existsSync(join(tmpDir, '.claude', 'settings.json'))).toBe(false);
  });
});
