# ctxify

Context compiler for AI coding agents. Works with single repos, multi-repo workspaces, and monorepos.

ctxify scans your workspace and generates sharded context files — so an AI agent can query exactly the context it needs (repo details, endpoints, types, env vars) without loading everything.

## Install

```bash
git clone git@github.com:benjollymore/ctxify.git
cd ctxify
npm install && npm run build && npm link
```

## Quickstart

### Any repo (just works)

```bash
cd my-project
ctxify init
```

Auto-detects single-repo, monorepo, or multi-repo. Creates ctx.yaml, runs first scan.

### Multi-repo (guided setup)

```bash
cd workspace/
ctxify init --interactive
```

Walks you through workspace setup: detects repos, asks about
relationships, recommends a directory structure.

After init, query context:

```bash
ctxify query --repo api-server --section endpoints --dir .
ctxify query --section types --dir .
ctxify scan --dir .   # re-scan (skips if fresh)
```

## Operating modes

ctxify supports three modes, set during `ctxify init` or in `ctx.yaml`:

| Mode | Use case | Repo discovery |
|------|----------|----------------|
| `single-repo` | One repository | Workspace root is the repo; no cross-repo inference |
| `multi-repo` | Multiple independent repos | Finds `.git/` directories recursively |
| `mono-repo` | Monorepo with workspace packages | Reads `package.json` workspaces / `pnpm-workspace.yaml` |

Mode is stored in `ctx.yaml` as `mode: single-repo | multi-repo | mono-repo`. Configs without `mode` default to `multi-repo` for backward compatibility.

### Multi-repo git coordination

In multi-repo mode, ctxify provides commands to branch and commit across all repos at once:

```bash
# Create a branch in every configured repo
ctxify branch feature-x --dir .

# Commit in all repos that have changes (skips clean repos)
ctxify commit "implement feature x" --dir .

# Add a new repo to the workspace
ctxify add-repo ../new-service --dir .
```

### Monorepo detection

ctxify auto-detects your package manager and workspace packages:

- **npm/yarn** — reads `workspaces` from root `package.json`
- **pnpm** — reads `pnpm-workspace.yaml`
- **turborepo** — detects `turbo.json`, uses `package.json` workspaces for package globs

## Usage

### Scan a workspace

```bash
ctxify scan --dir .
```

Returns JSON index on stdout. Creates sharded `.ctx/` directory:

```
.ctx/
  index.yaml                    # ~300 bytes — workspace overview
  repos/<name>.yaml             # Per-repo detail (deps, scripts, conventions)
  endpoints/<name>.yaml         # API endpoints per repo
  types/shared.yaml             # Cross-repo shared types
  env/all.yaml                  # Env var names + sources
  topology/graph.yaml           # Relationship graph
  schemas/<name>.yaml           # DB schemas per repo
  questions/pending.yaml        # Unresolved questions
```

Run again with no changes: `"status": "fresh"`, instant return. Force re-scan with `--force`.

### Query specific context

```bash
# Full repo detail (~400 bytes)
ctxify query --repo api-server --dir .

# Endpoints for one repo (~200 bytes)
ctxify query --repo api-server --section endpoints --dir .

# All POST endpoints
ctxify query --section endpoints --method POST --dir .

# Endpoints matching path
ctxify query --section endpoints --path-contains users --dir .

# Shared types
ctxify query --section types --dir .

# Specific type by name
ctxify query --section types --name UserProfile --dir .

# Env vars for one repo
ctxify query --repo frontend --section env --dir .

# Relationship graph
ctxify query --section topology --dir .
```

All output is JSON on stdout, errors to stderr.

### Check freshness

```bash
ctxify status --dir .
```

### Initialize a new workspace

```bash
# Auto-detect (default — no prompts)
ctxify init .

# Guided interview for multi-repo setup
ctxify init --interactive .
```

Creates `ctx.yaml`, runs first scan.

## What it detects

- **Repos:** Git roots, language, framework (React, Hono, Express, FastAPI, Flask, Next.js, Go, etc.)
- **APIs:** Route patterns from Express, Hono, FastAPI, Flask, Next.js App Router, Go net/http
- **Types:** Exported interfaces/types/enums and cross-repo usage
- **Env vars:** Names from `.env` files, docker-compose, and code references (never values)
- **Relationships:** Workspace deps, API consumers, shared env vars, shared types
- **Conventions:** Tooling configs, naming patterns, architecture style, testing approach
- **DB schemas:** Prisma, Drizzle, SQLAlchemy, TypeORM models

## Claude Code integration

Install the `/ctxify` skill:

```bash
mkdir -p ~/.claude/skills/ctxify
cp .claude/skills/ctxify/SKILL.md ~/.claude/skills/ctxify/SKILL.md
```

Then type `/ctxify` in any Claude Code session, or just ask Claude to scan the workspace.

## Commands

| Command | Description |
|---------|-------------|
| `ctxify init [dir]` | Auto-detect repos, create ctx.yaml, run first scan (`--interactive` for guided setup) |
| `ctxify scan` | Scan workspace, write shards, output JSON index |
| `ctxify query` | Query specific shards with filters |
| `ctxify status` | JSON staleness report |
| `ctxify branch <name>` | Create branch in all repos (multi-repo only) |
| `ctxify commit <message>` | Stage + commit in dirty repos (multi-repo only) |
| `ctxify add-repo <path>` | Add a repo to multi-repo config |

All commands accept `--dir <path>` (defaults to `.`).

**Key flags:**

| Flag | Available on | Effect |
|------|-------------|--------|
| `--force` | `scan`, `init` | Re-scan even if fresh / overwrite existing config |
| `--interactive`, `-i` | `init` | Guided interview for multi-repo setup |
| `--with-answers` | `scan` | Incorporate answers from `.ctx/answers.yaml` |
| `--repo <name>` | `query` | Filter by repo |
| `--section <s>` | `query` | Section: endpoints, types, env, topology, schemas, questions |
| `--method <m>` | `query` | Filter endpoints by HTTP method |
| `--path-contains <s>` | `query` | Filter endpoints by path substring |
| `--name <n>` | `query`, `add-repo` | Filter types by name / override repo name |
| `--scan` | `add-repo` | Run scan after adding |

## Development

```bash
npm run build        # build with tsup
npm run dev          # build in watch mode
npm test             # run vitest
npm run typecheck    # tsc --noEmit
```

## How it works

ctxify runs a pipeline of 8 analysis passes over the workspace. Independent passes run in parallel across 4 levels:

```
Level 0: [repo-detection]
Level 1: [manifest-parsing, structure-mapping, env-scanning]        — 3 in parallel
Level 2: [api-discovery, type-extraction, convention-detection]     — 3 in parallel
Level 3: [relationship-inference]
```

1. **Repo detection** — mode-aware: finds `.git/` dirs (multi-repo), reads workspace packages (mono-repo), or uses workspace root (single-repo)
2. **Manifest parsing** — read package.json, go.mod, pyproject.toml
3. **Structure mapping** — identify key dirs, entry points, file counts
4. **API discovery** — regex-based route extraction
5. **Type extraction** — find exports, cross-reference imports across repos
6. **Env scanning** — parse `.env` files and code references
7. **Relationship inference** — connect repos via deps, API calls, shared state (skipped in single-repo mode)
8. **Convention detection** — tooling, naming, architecture patterns

Passes write to a shared `WorkspaceContext` object, which shard renderers transform into the `.ctx/` output files. A cache tracks git SHAs and file hashes for staleness detection.
