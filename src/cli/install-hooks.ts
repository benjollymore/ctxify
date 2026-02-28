import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { SkillScope } from '../core/config.js';

// ── Types ────────────────────────────────────────────────────────────────

interface HookEntry {
  type: string;
  command: string;
  matcher?: string;
}

interface HooksConfig {
  hooks?: {
    SessionStart?: HookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── Constants ────────────────────────────────────────────────────────────

const HOOK_MARKER = 'ctxify context-hook';

// ── Pure merge helper (testable) ─────────────────────────────────────────

/**
 * Merges a ctxify SessionStart hook entry into existing settings JSON.
 * Returns the updated JSON string. Idempotent — replaces existing ctxify entry.
 */
export function mergeHookIntoSettings(existingJson: string | null, command: string): string {
  let settings: HooksConfig = {};

  if (existingJson !== null) {
    try {
      settings = JSON.parse(existingJson) as HooksConfig;
    } catch {
      // If JSON is malformed, start fresh
      settings = {};
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const newEntry: HookEntry = {
    type: 'command',
    command,
    matcher: 'startup|resume|compact',
  };

  if (!settings.hooks.SessionStart) {
    settings.hooks.SessionStart = [newEntry];
  } else {
    // Remove any existing ctxify entry
    settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
      (entry) => !entry.command?.includes(HOOK_MARKER),
    );
    settings.hooks.SessionStart.push(newEntry);
  }

  return JSON.stringify(settings, null, 2);
}

/**
 * Removes ctxify hook entries from settings JSON.
 * Returns the updated JSON string, or null if the result would be empty.
 */
export function removeHookFromSettings(existingJson: string): string | null {
  let settings: HooksConfig;

  try {
    settings = JSON.parse(existingJson) as HooksConfig;
  } catch {
    return null;
  }

  if (!settings.hooks?.SessionStart) {
    return existingJson;
  }

  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
    (entry) => !entry.command?.includes(HOOK_MARKER),
  );

  // Clean up empty structures
  if (settings.hooks.SessionStart.length === 0) {
    delete settings.hooks.SessionStart;
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return JSON.stringify(settings, null, 2);
}

// ── Install / Remove ─────────────────────────────────────────────────────

function buildCommand(installMethod: 'global' | 'local' | 'npx'): string {
  if (installMethod === 'npx') return 'npx @benjollymore/ctxify context-hook';
  if (installMethod === 'local') return 'npx ctxify context-hook';
  return 'ctxify context-hook';
}

function resolveSettingsPath(
  workspaceRoot: string,
  scope: SkillScope,
  homeDir?: string,
): string {
  if (scope === 'global') {
    return join(homeDir ?? homedir(), '.claude', 'settings.json');
  }
  return join(workspaceRoot, '.claude', 'settings.json');
}

/**
 * Installs a Claude Code SessionStart hook that runs `ctxify context-hook`.
 * Returns the command string that was installed.
 */
export function installClaudeHook(
  workspaceRoot: string,
  installMethod: 'global' | 'local' | 'npx',
  scope: SkillScope = 'workspace',
  homeDir?: string,
): string {
  const command = buildCommand(installMethod);
  const settingsPath = resolveSettingsPath(workspaceRoot, scope, homeDir);

  const existingJson = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf-8') : null;
  const updatedJson = mergeHookIntoSettings(existingJson, command);

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, updatedJson, 'utf-8');

  return command;
}

/**
 * Removes ctxify SessionStart hook from Claude Code settings.
 */
export function removeClaudeHook(workspaceRoot: string, homeDir?: string): void {
  // Try both workspace and global locations
  for (const scope of ['workspace', 'global'] as const) {
    const settingsPath = resolveSettingsPath(workspaceRoot, scope, homeDir);

    if (!existsSync(settingsPath)) continue;

    try {
      const existingJson = readFileSync(settingsPath, 'utf-8');
      const updatedJson = removeHookFromSettings(existingJson);
      if (updatedJson !== null) {
        writeFileSync(settingsPath, updatedJson, 'utf-8');
      }
    } catch {
      // Non-fatal — if settings can't be read/written, skip
    }
  }
}
