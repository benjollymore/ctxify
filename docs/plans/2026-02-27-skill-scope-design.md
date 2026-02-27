# Configurable skill install scope

**Date:** 2026-02-27
**Status:** Approved

## Problem

All skill installations go to workspace-local paths. There is no option to install globally (e.g., `~/.claude/skills/`). Users have experienced inconsistency between skills ending up in global vs project-level locations. The install scope should be an explicit, tracked choice.

## Design

### Config shape change

`CtxConfig.skills` changes from `Record<string, string>` to `Record<string, SkillEntry>`:

```typescript
export type SkillScope = 'workspace' | 'global';

export interface SkillEntry {
  path: string;
  scope: SkillScope;
}
```

ctx.yaml example:
```yaml
skills:
  claude:
    path: ".claude/skills/ctxify/SKILL.md"
    scope: workspace
  cursor:
    path: ".cursor/rules/ctxify.md"
    scope: workspace
```

**Backward compat:** `validateSkills` accepts both the old plain string format and the new object format. Old strings normalize to `{ path, scope: 'workspace' }`.

### Agent config — global paths

Add optional `globalDestDir` to `AgentConfig`:

| Agent | `destDir` (workspace) | `globalDestDir` |
|-------|----------------------|-----------------|
| Claude | `.claude/skills/ctxify` | `~/.claude/skills/ctxify` |
| Codex | `.` | `~/.codex` |
| Copilot | `.github/instructions` | *(none)* |
| Cursor | `.cursor/rules` | *(none)* |

`installSkill` gains a `scope` parameter:
```typescript
export function installSkill(workspaceRoot: string, agent: string, scope: SkillScope = 'workspace'): string
```

When `scope === 'global'`, uses `globalDestDir` (resolved from `~` via `os.homedir()`) instead of `workspaceRoot + destDir`.

### Interactive flow

After the agent multi-select, for each agent that has `globalDestDir`, prompt:

```
Where should Claude Code skills be installed?
  > This workspace (.claude/skills/)
    Global (~/.claude/skills/ — available in all projects)
```

Agents without `globalDestDir` silently default to workspace.

`ScaffoldOptions` gains:
```typescript
agentScopes?: Record<string, SkillScope>;
```

**Non-interactive mode:** defaults to `workspace` for all agents. No CLI flag for scope.

### Upgrade command

`runUpgrade` reads `scope` from each `SkillEntry` and passes it to `installSkill`. Reinstalls to the same location chosen during init. Old-format strings treated as `scope: 'workspace'`.

### Test impact

All changes land in existing test files:
- `config.test.ts` — SkillEntry validation, backward compat
- `install-skill.test.ts` — global scope paths, workspace scope unchanged
- `init-scaffold.test.ts` — agentScopes flow-through, ctx.yaml persistence
- `init-interactive.test.ts` — resolveInteractiveOptions passes agentScopes
- `upgrade.test.ts` — scope read from new format, backward compat with old strings
