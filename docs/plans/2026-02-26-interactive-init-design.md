# Interactive `ctxify init` + Skill Installation

**Date:** 2026-02-26
**Status:** Approved

## Problem

ctxify has no way to install itself into a target workspace. The SKILL.md lives inside the ctxify repo only. Users must know the right flags (`--repos`, `--mono`) upfront. There's no guided setup experience.

## Solution

Make `ctxify init` interactive by default. When no mode-determining flags are passed, it walks the user through workspace setup — including installing the agent skill file. Existing flags continue to work unchanged for non-interactive/agent use.

## Interactive flow

```
ctxify init [dir]
  ├─ flags present (--repos, --mono)? → existing non-interactive path
  └─ no flags? → interactive flow
       ├─ 1. Ask agent type (Claude Code / skip)
       ├─ 2. Auto-detect mode, confirm with user
       ├─ 3. If multi-repo: confirm discovered repo list
       ├─ 4. Run existing scaffolding logic
       ├─ 5. Copy skill file to target workspace
       └─ 6. Print summary
```

### Step 1 — Agent selection

```
? Which AI agent do you use?
❯ Claude Code
  Skip (no skill installation)
```

Only Claude Code supported now. Others can be added later.

### Step 2 — Mode detection

```
Detected workspace mode: multi-repo (3 repos found)
? Is this correct? (Y/n)
```

If rejected, offer manual selection: single-repo / multi-repo / mono-repo.

### Step 3 — Repo confirmation (multi-repo only)

```
Found repositories:
  ✓ milkmoovement-fuse (./milkmoovement-fuse)
  ✓ express (./express)
  ✓ api (./api)
? Include all repositories? (Y/n)
```

If rejected, checkbox selection of repos.

### Step 4 — Scaffold

Runs the existing `init` scaffolding with the collected parameters. No changes to the core logic.

### Step 5 — Skill installation

Copies `SKILL.md` from ctxify's package to `<workspace>/.claude/skills/ctxify/SKILL.md`. Prepends a version comment:

```markdown
<!-- ctxify v2.0.0 — do not edit manually, managed by ctxify init -->
```

Version sourced from ctxify's own package.json at build time (or read at runtime from the installed package).

### Step 6 — Summary

JSON output (same as current, with new field):

```json
{
  "status": "initialized",
  "mode": "multi-repo",
  "repos": ["milkmoovement-fuse", "express", "api"],
  "skill_installed": ".claude/skills/ctxify/SKILL.md",
  "shards_written": true
}
```

## File changes

### New files

- `src/cli/commands/init-interactive.ts` — interactive prompt flow using @inquirer/prompts. Collects agent type, mode confirmation, repo selection. Returns data in the same shape as flag parsing.
- `src/cli/install-skill.ts` — copies SKILL.md to target workspace's agent skill directory. Handles directory creation, version stamping.

### Modified files

- `src/cli/commands/init.ts` — refactor scaffolding into a callable `scaffoldWorkspace()` function. Add interactive-path detection: if no mode flags, call interactive flow, then feed results to scaffolding.
- `package.json` — add `@inquirer/prompts` dependency.
- `CLAUDE.md` — update "Key patterns" section noting interactive default.

### Unchanged

- All template generators (pure functions, no changes needed)
- Core logic (config, manifest, detect, validate)
- Other commands (status, validate, branch, commit)

## Skill installation strategy

Copy, not symlink. Reasons:

- npm-idiomatic: when installed globally or via npx, ctxify's location is unpredictable
- Version-stamped: the comment header enables future `ctxify upgrade` to detect and overwrite stale skills
- Portable: workspace can be shared without requiring ctxify to be installed at the same path

Agent skill directories by agent type:

| Agent | Skill path |
|-------|-----------|
| Claude Code | `.claude/skills/ctxify/SKILL.md` |
| (future) | TBD |

## Backward compatibility

- All existing flags (`--repos`, `--mono`, `--force`) work identically
- JSON output format unchanged (new `skill_installed` field is additive)
- Non-interactive path is the same code path, just invoked differently
- `--force` applies to both scaffold and skill overwrite

## Dependencies

- `@inquirer/prompts` — modern, composable prompt components (select, confirm, checkbox). ESM-compatible.

## Future work

- `ctxify upgrade` command to update skill files to latest version
- Support for additional agent types (Cursor, Windsurf, etc.)
- `--no-interactive` flag if explicit non-interactive mode is ever needed beyond flag detection
