---
repo: ctxify
type: overview
ctxify_version: 0.7.1
language: typescript
framework: commander
---

# ctxify

ctxify is a CLI tool and Node library that scaffolds persistent context files (`.ctxify/`) for AI coding agents, then validates and audits their quality. It is consumed directly by human developers running `ctxify init` and by agents (Claude Code, Copilot, Cursor, Codex) that read the scaffolded `.md` shards to understand a workspace. The npm package (`@benjollymore/ctxify`) also exposes a programmatic API for embedding in other tools.

## Architecture

- `bin/` — CLI entry point. Registers all Commander.js commands, runs the non-blocking version-check hook, then calls `program.parseAsync()`.
- `src/cli/commands/` — One file per command (`init`, `domain`, `patterns`, `audit`, `validate`, …). Each file exports a `register*Command(program)` function. Commands own I/O: they call core functions and `console.log(JSON.stringify(...))`.
- `src/core/` — Pure business logic with no stdout side effects: `config.ts` (load/save ctx.yaml), `manifest.ts` (parse package.json/go.mod/pyproject.toml), `validate.ts` (segment-marker integrity), `audit.ts` (quality heuristics), `detect.ts` (workspace mode detection).
- `src/templates/` — Pure functions that take typed data and return markdown strings. No file I/O. Called by `init` and `patterns`/`domain` commands.
- `src/utils/` — Shared utilities: `fs.ts`, `git.ts` (read-only), `git-mutate.ts` (write), `frontmatter.ts`, `segments.ts`, `yaml.ts`, `version.ts`, `monorepo.ts`.
- `src/cli/install-skill.ts` — Reads skill files from `skills/` at package root and writes them to agent-specific paths (`.claude/skills/`, `.cursor/rules/`, etc.), with agent-specific frontmatter.
- `src/cli/install-hooks.ts` — Installs Claude Code `SessionStart` hook by patching `.claude/settings.json`.
- `eval/` — Standalone evaluation harness for measuring output quality against scored rubrics. Not part of the main CLI build; runs separately against real repos.
- `skills/` — Source skill files (`SKILL.md` + 5 satellites) installed to agent-specific paths by `ctxify init --agent`.

The layering rule: commands import from `core/` and `templates/`, never the reverse. `utils/` is imported by everyone. Templates never import from `core/`. This keeps template generators testable in isolation and keeps business logic out of I/O-handling code.

## Domains

<!-- domain-index -->
- `eval-harness.md` — The eval/ system: how quality scoring works, task definitions, rubrics, and how to run evals
- `skills.md`
- `corrections.md`
- `cli.md`
<!-- /domain-index -->
