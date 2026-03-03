---
repo: ctxify
type: domain
ctxify_version: 0.7.1
domain: skills
---

# skills

The skill installation system reads source files from `skills/`, transforms them for each agent, and writes them to agent-specific paths during `ctxify init --agent`.

## Overview

Skills are markdown files in `skills/` that get installed to agent-specific paths during `ctxify init --agent`. The installation reads 6 source files from `skills/`, strips their frontmatter, injects agent-specific frontmatter and a version comment header, then writes them to the agent's expected location. Agents find and invoke skills by convention (file path and frontmatter format vary per agent).

The core logic lives in `src/cli/install-skill.ts`. `scaffoldWorkspace()` in `init.ts` calls `installSkill()` once per selected agent, then persists the installed paths to `ctx.yaml`.

## Concepts

**The 6 skill files:**
- `SKILL.md` — primary skill (context loading), always installed as the agent's primary filename
- `filling-context.md`, `domain.md`, `corrections.md`, `rules.md`, `multi-repo.md` — satellite skills, each focused on one workflow

**Multi-file agents (claude, cursor):** Each skill becomes a separate file. Agent-specific frontmatter is generated from each source file's `name` and `description` frontmatter fields. For Claude Code, each satellite skill gets its own sibling directory containing `SKILL.md` — this is how Claude Code registers independently invokable skills (`dir/SKILL.md` pattern).

- Claude: `SKILL.md` → `.claude/skills/ctxify/SKILL.md`, satellites → `.claude/skills/ctxify-{name}/SKILL.md`
- Cursor: `SKILL.md` → `.cursor/rules/ctxify.md`, satellites → `.cursor/rules/{name}.md`

**Single-file agents (copilot, codex):** All 6 skills are concatenated into one file separated by `---` dividers. Source frontmatter is stripped; one combined frontmatter is prepended. This is necessary because these agents don't support multi-file skill registries.

- Copilot: `.github/instructions/ctxify.instructions.md` with `applyTo: "**"` frontmatter
- Codex: `AGENTS.md` at workspace root, no frontmatter

**Version comment header:** Every installed file (primary and satellite) starts with `<!-- ctxify v{version} — do not edit manually, managed by ctxify init -->`. This header is how ctxify identifies files it previously installed — used during cleanup to remove stale files without touching user-created files.

**Scope:** `workspace` (default) installs under the workspace root. `global` installs under `$HOME`. Only claude and codex support global scope. Scope is persisted per-agent in `ctx.yaml`.

## Decisions

**Why separate directories for Claude Code satellites?** Claude Code requires `{skillName}/SKILL.md` to register a skill as independently invokable via the `/skillName` slash command. A flat directory of files doesn't work — they wouldn't appear in the command palette.

**Why concatenate for copilot and codex?** These agents have no multi-file skill concept. A single instructions file is their only integration point. Concatenation with `---` dividers preserves the full content while fitting the format.

**Why strip source frontmatter?** Source skill files have frontmatter shaped for ctxify's internal use (`name`, `description`). Agents need frontmatter shaped for their own conventions (`alwaysApply` for Cursor, `applyTo` for Copilot). The agent-specific frontmatter is generated fresh on each install.

**Why the version comment?** Provides safe stale-file detection without needing a manifest. Any `.md` file in the install directory that contains `<!-- ctxify v` was written by ctxify and is safe to remove on reinstall or cleanup.

## Patterns

**Adding a new skill file:** Drop a `.md` file into `skills/` with `name` and `description` frontmatter. `listSkillSourceFiles()` auto-discovers all `.md` files — SKILL.md sorts first, the rest alphabetically. The new skill will be included in the next `ctxify init --agent` run for all agents.

**Adding a new agent:** Add an entry to `AGENT_CONFIGS` in `install-skill.ts`. Use `singleFile: true` + `combinedFrontmatter` for agents with a single instructions file, or `skillFrontmatter` (and optionally `satelliteFilename`) for multi-file agents. Set `globalDestDir` only if global scope makes sense for that agent.

```typescript
// Multi-file agent example (new-agent uses dir/SKILL.md like Claude)
'new-agent': {
  displayName: 'New Agent',
  destDir: '.new-agent/skills/ctxify',
  primaryFilename: 'SKILL.md',
  satelliteFilename: 'SKILL.md',
  skillFrontmatter: ({ name, description, version }) =>
    `---\nname: ${name}\ndescription: ${description}\nversion: "${version}"\n---`,
  nextStepHint: 'open New Agent and run /ctxify',
}
```

## Traps

- **Modifying installed skill files directly:** The version comment marks them as ctxify-managed. Reinstalling (`ctxify init --agent`) will overwrite edits silently. Edit source files in `skills/` instead, then reinstall.

- **Forgetting `satelliteFilename` for Claude-style agents:** Without it, satellites write flat into the base dir. Claude Code won't register them as invokable skills — they become invisible in the command palette.

- **Source frontmatter key mismatch:** `listSkillSourceFiles()` reads `name` and `description` from source frontmatter to generate agent frontmatter. If a skill file is missing these fields, the installed frontmatter falls back to `'ctxify'` and `''` — the skill installs but may not display correctly in agent UIs.

- **Stale satellite directories:** If a skill file is deleted from `skills/`, the old satellite directory (`.claude/skills/ctxify-{name}/`) persists until reinstall. The cleanup logic in `installSkill()` removes satellite dirs not in the current skill list — but only when reinstalling, not passively.
