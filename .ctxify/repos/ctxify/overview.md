---
repo: ctxify
type: overview
language: typescript
framework: commander
entry_points:
  - src/index.ts
  - bin/ctxify.ts
file_count: 94
---

# ctxify

A CLI scaffolder + validator that generates `.ctxify/` context workspaces for AI agents. It detects repos, parses manifests (package.json, go.mod, etc.) to extract mechanical facts, and scaffolds CLAUDE.md-style markdown templates with TODO placeholders. Agents fill semantic content; ctxify handles mechanical extraction. Consumed by agents and developers via the `ctxify` CLI, and as a library via `src/index.ts`.

Entry points: `src/index.ts`, `bin/ctxify.ts`

## Architecture

- `bin/` — CLI entry: `ctxify.ts` registers Commander.js commands and shims ESM `__dirname`
- `src/` — All library and CLI source
- `src/cli/commands/` — One file per command (`init`, `validate`, `status`, `branch`, `commit`, `domain`, `patterns`, `feedback`, `clean`, `upgrade`)
- `src/cli/install-skill.ts` — Agent skill installer (reads `skills/`, writes to agent-specific paths)
- `src/core/` — Business logic: config parsing, manifest detection, shard validation, mode detection
- `src/templates/` — Pure functions producing markdown strings (index, repo overview, domain, patterns, corrections)
- `src/utils/` — Shared utilities: fs, git read, git write, yaml, frontmatter, segment extraction, version check

**Data flow:** `bin/ctxify.ts` → Commander command → `src/cli/commands/*.ts` handler → `src/core/*.ts` logic + `src/templates/*.ts` generators → file writes via `src/utils/fs.ts`

Testing: vitest with temp directories per test (created in `beforeEach`, removed in `afterEach`). Integration tests invoke the compiled CLI binary via `execFileSync`. Build: tsup produces `dist/index.js` (library) and `dist/bin/ctxify.js` (CLI with shebang).

## Commands

- **build**: `npm run build` → `tsup` (library + CLI bundles)
- **test**: `npm test` → `vitest run` (232 tests, 20 files)
- **typecheck**: `npm run typecheck` → `tsc --noEmit`
- **dev**: `npm run dev` → `tsup --watch`

## Context

- [`patterns.md`](patterns.md) — How to add commands, templates, tests
- [`corrections.md`](corrections.md) — Documented mistakes (always load)

<!-- domain-index -->
- `init.md` — Workspace scaffolding: interactive + flag-driven init, manifest parsing, skill installation
- `templates.md` — Markdown template generators: pure functions producing shard files with frontmatter and TODO placeholders
- `validate.md` — Shard structural integrity checks: frontmatter, segment markers, TODO detection
- `skills-install.md` — Agent skill installation: multi-file vs single-file strategies, scope, frontmatter per agent
<!-- /domain-index -->
