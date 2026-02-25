# ctxify

Multi-repo context compiler for AI coding agents.

ctxify scans a workspace with multiple repositories and generates structured context files — so an AI agent can understand repo topology, API contracts, shared types, and cross-repo relationships without re-exploring every session.

## Install

```bash
git clone git@github.com:benjollymore/ctxify.git
cd ctxify
npm install && npm run build && npm link
```

## Usage

### Scan a workspace

```bash
# In a directory containing multiple repos:
ctxify init .
```

This auto-detects git repos, creates a `ctx.yaml` manifest, and generates all context files.

### Output

```
workspace/
  ctx.yaml              # editable manifest
  AGENTS.md             # lean index — read this first
  .ctx/
    topology.yaml       # machine-readable repo graph
    api-contracts.md    # endpoint signatures across repos
    shared-types.md     # types crossing repo boundaries
    repo-<name>.md      # per-repo structure, patterns, key files
    env-vars.md         # env var names (never values)
    db-schema.md        # database models and relationships
    questions.md        # ambiguities needing clarification
```

### Keep context fresh

```bash
# Check what's stale
ctxify status --dir .

# Incremental update (only re-scans changed repos)
ctxify refresh --dir .

# Full regeneration
ctxify generate --dir .
```

### Handle ambiguities

When ctxify can't confidently infer a relationship, it writes questions to `.ctx/questions.md`. Answer them in `.ctx/answers.yaml` and re-run:

```bash
ctxify generate --with-answers --dir .
```

## What it detects

- **Repos:** Git roots, language, framework (React, Hono, Express, FastAPI, Flask, Next.js, Go, etc.)
- **APIs:** Route patterns from Express, Hono, FastAPI, Flask, Next.js App Router, Go net/http
- **Types:** Exported interfaces/types/enums and cross-repo usage
- **Env vars:** Names from `.env` files, docker-compose, and code references (never values)
- **Relationships:** Workspace deps, API consumers, shared env vars, shared types
- **Conventions:** Tooling configs, naming patterns, architecture style, testing approach
- **DB schemas:** Prisma, Drizzle, SQLAlchemy, TypeORM models

## Claude Code integration

Install the `/ctxify` skill so Claude auto-discovers and uses it:

```bash
mkdir -p ~/.claude/skills/ctxify
cp .claude/skills/ctxify/SKILL.md ~/.claude/skills/ctxify/SKILL.md
```

Then type `/ctxify` in any Claude Code session, or just ask Claude to scan the workspace.

## Commands

| Command | Description |
|---------|-------------|
| `ctxify init [dir]` | Auto-detect repos, create ctx.yaml, generate context |
| `ctxify generate` | Full analysis pipeline, write all output files |
| `ctxify generate --with-answers` | Re-run incorporating answers from `.ctx/answers.yaml` |
| `ctxify refresh` | Diff-aware incremental update (only stale repos) |
| `ctxify status` | Show which repos/files are stale vs current |

All commands accept `--dir <path>` to specify the workspace directory (defaults to `.`).

## Development

```bash
npm run build        # build with tsup
npm run dev          # build in watch mode
npm test             # run vitest
npm run typecheck    # tsc --noEmit
```

## How it works

ctxify runs an ordered pipeline of analysis passes over the workspace:

1. **Repo detection** — find `.git/` directories
2. **Manifest parsing** — read package.json, go.mod, pyproject.toml
3. **Structure mapping** — identify key dirs, entry points, file counts
4. **API discovery** — regex-based route extraction
5. **Type extraction** — find exports, cross-reference imports across repos
6. **Env scanning** — parse `.env` files and code references
7. **Relationship inference** — connect repos via deps, API calls, shared state
8. **Convention detection** — tooling, naming, architecture patterns

Passes write to a shared `WorkspaceContext` object, which renderers then transform into the output files. A cache tracks git SHAs and file hashes for diff-aware refresh.
