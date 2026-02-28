---
repo: ctxify
type: domain
domain: init
---

# init

Handles `ctxify init` command: workspace detection (single/multi/mono-repo), repository discovery via git root hunting, manifest parsing (language/framework/deps), template scaffolding, config serialization, and agent skill installation. Bridges mechanical extraction (parsing) with semantic scaffolding (templates). Interactive and non-interactive paths converge on `scaffoldWorkspace()`.

## Concepts

**Operating modes**: single-repo (one repo), multi-repo (siblings under workspace root), mono-repo (npm/yarn/pnpm/turborepo workspaces). Mode detection in `autoDetectMode()` checks for workspace package.json fields, then looks for git roots. **Repository discovery**: `findGitRoots()` scans for .git directories. Flags `--repos` + `--mono` bypass interactive mode. **Manifest fallback chain**: pkg.json → go.mod → pyproject.toml → requirements.txt. Extracts language, framework (via dependency detection), entry points, key dirs, file count. **Skill installation**: 7 markdown files installed to agent-specific paths (Claude: `.claude/skills/ctxify/`, Copilot: `.github/instructions/`, Cursor: `.cursor/rules/`). **Config serialization**: all repo/relationship/option metadata written to ctx.yaml for future command lookups. **Interactive flow**: prompts for agent type, mode confirmation, repo selection. Non-TTY or flags skip interaction.

## Decisions

**Interactive by default, flags for agents.** `runInteractiveFlow()` uses @inquirer/prompts for human-friendly discovery. Flags bypass this for CI/agent use. Both paths call `scaffoldWorkspace()` so logic is shared. **Manifest fallback chain over per-language detection.** Trying all manifests in order is simpler than hardcoding language→manifest mappings and scales to new languages. First found wins: if pkg.json exists but is malformed, error halts; other manifests not tried. Trade-off: requires robust error handling in parse functions. **Skills installed during scaffold, persisted in config.** `scaffoldWorkspace()` installs skills first, then writes them to ctx.yaml so `ctxify upgrade` can reinstall without re-running init. **Install method auto-detected and stored.** Detects whether installed globally, locally, or via npx from process.argv[1]. Persisted in config so `ctxify upgrade` uses the same installation method.

## Patterns

**Mode detection flow**: `autoDetectMode()` tries monorepo indicators (pkg.json workspaces), then `findGitRoots()` for all .git directories. Single repo detected if 1 root, multi-repo if >1 root under workspace. **Manifest parsing with defaults**: `parseRepoManifest()` tries manifests in order, returns empty defaults if none found. Each manifest parser extracts language, framework (by detecting known deps), entry points, key dirs. **Interactive multi-select**: uses `@inquirer/prompts` checkbox for agent selection and `select()` for mode confirmation. Non-TTY falls through to auto-detect. **Template generation is stateless**: `generateIndexTemplate()`, `generateRepoTemplate()` take typed data, return strings. Init command writes files. Enables testing generators without side effects.

## Cross-repo

`ctxify init` runs from workspace root and discovers all repos at once. Manifest parsing happens per-repo (call `parseRepoManifest()` for each). Multi-repo relationships are optional: agents fill cross-repo workflows in index.md after init. Skills are installed once to workspace (or global home dir), not per-repo. Hook installation (Claude Code SessionStart hook) is workspace-wide, installed to `.claude/settings.json`.
