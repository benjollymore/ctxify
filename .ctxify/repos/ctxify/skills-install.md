---
repo: ctxify
type: domain
domain: skills-install
---

# skills-install

Reads skill markdown files from `skills/` (SKILL.md + 5 satellite files) and writes them to agent-specific destinations. Two strategies: **multi-file** (claude, cursor) installs each skill as a separate file with agent-specific frontmatter; **single-file** (copilot, codex) concatenates all skills into one file. All installed files include a version comment header (`<!-- ctxify v... -->`).

## Key Files

- `src/cli/install-skill.ts` — `installSkill()`, `AGENT_CONFIGS`, `listSkillSourceFiles()`, `getSkillSourceDir()`
- `skills/SKILL.md` — primary skill file (installed first, always)
- `skills/*.md` — 5 satellite skills (installed alphabetically after SKILL.md)
- `src/cli/commands/init.ts:52` — `scaffoldWorkspace()` calls `installSkill()` per agent before writing ctx.yaml

## Patterns

**`AGENT_CONFIGS` drives all agent-specific logic:**
| Agent | Strategy | Dest | Primary file |
|-------|----------|------|-------------|
| claude | multi-file, each in own subdirectory | `.claude/skills/ctxify/` | `SKILL.md` |
| copilot | single-file | `.github/instructions/` | `ctxify.instructions.md` |
| cursor | multi-file | `.cursor/rules/` | `ctxify.md` |
| codex | single-file | `.` (workspace root) | `AGENTS.md` |

**Scope (claude, codex only):** `'workspace'` installs to `destDir` relative to workspace. `'global'` installs to `globalDestDir` relative to `$HOME`. Other agents don't support global scope.

**`satelliteFilename` (claude only):** Each satellite skill gets its own directory inside `.claude/skills/ctxify/{skill-name}/SKILL.md`. This matches Claude Code's one-directory-per-skill convention.

**`listSkillSourceFiles()`** returns files ordered SKILL.md-first, then alphabetical. This order is preserved in single-file concatenation.

**Adding a new skill file:** Drop a `.md` file in `skills/`. It will be auto-discovered by `listSkillSourceFiles()` and included in the next install. Update `test/unit/install-skill.test.ts` to assert the new file count.

**Adding a new agent:** Add an entry to `AGENT_CONFIGS` in `install-skill.ts`, add it to `AgentType` union in `init.ts`, and update `test/unit/install-skill.test.ts`.

## Cross-repo

Single-repo. Skills installed into workspace are consumed by the target AI agent (Claude Code, Copilot, Cursor, Codex) — not by ctxify itself at runtime.
