---
name: ctxify
description: Use when starting work in a multi-repo workspace, when you need cross-repo context, or when the user says "ctxify" or "scan workspace". Generates AGENTS.md and satellite context files so you understand repo topology, API contracts, shared types, and relationships without re-exploring.
---

# ctxify — Multi-Repo Context Compiler

## Overview

ctxify scans a multi-repo workspace and generates context files you can read to understand the entire codebase topology. Run it at session start, read AGENTS.md, then pull satellite files as needed.

**Core principle:** Run once, read context, skip re-exploration.

## Quick Start

### First time in a workspace

```bash
ctxify init <workspace-dir>
```

This auto-detects repos, creates `ctx.yaml`, and runs full generation.

### Subsequent sessions

```bash
# Check if context is stale
ctxify status --dir <workspace-dir>

# If stale, refresh (only re-scans changed repos)
ctxify refresh --dir <workspace-dir>

# Or full regeneration
ctxify generate --dir <workspace-dir>
```

## Reading the Output

After generation, read files in this order:

### 1. Read AGENTS.md (always first)

```
<workspace>/AGENTS.md
```

This is your orientation file. It has:
- Repo table (name, language, framework, description)
- Key relationships (which repo calls which)
- Index of all satellite files
- Quick stats

### 2. Pull satellite files as needed for your task

| File | Read when... |
|------|-------------|
| `.ctx/topology.yaml` | You need the machine-readable dependency graph |
| `.ctx/api-contracts.md` | Working on API integration, endpoints, routes |
| `.ctx/shared-types.md` | Working with types that cross repo boundaries |
| `.ctx/repo-<name>.md` | Deep-diving into a specific repo |
| `.ctx/env-vars.md` | Configuring environment, debugging env issues |
| `.ctx/db-schema.md` | Working with database models |
| `.ctx/questions.md` | Ambiguities that need human clarification |

### 3. Handle questions (if any)

If `.ctx/questions.md` exists, read it and ask the human for answers. Write answers to `.ctx/answers.yaml`, then re-run:

```bash
ctxify generate --with-answers --dir <workspace-dir>
```

## When to Run

| Situation | Command |
|-----------|---------|
| New workspace, no ctx.yaml | `ctxify init <dir>` |
| Starting a session, context exists | `ctxify status --dir <dir>` then `refresh` if stale |
| Major changes across repos | `ctxify generate --dir <dir>` |
| After answering questions | `ctxify generate --with-answers --dir <dir>` |

## What It Detects

- Git repos and their languages/frameworks
- API routes (Express, Hono, FastAPI, Flask, Next.js App Router, Go)
- Exported types/interfaces shared across repos
- Environment variable names (never values)
- Cross-repo relationships (dependencies, API consumers, shared env vars)
- Conventions (tooling, naming, architecture patterns, testing)
- Database schemas (Prisma, Drizzle, SQLAlchemy, TypeORM)

## Integration

**Composable with:**
- **OpenSpec** — ctxify output provides the codebase context that OpenSpec needs to write accurate specs
- **GSD** — ctxify topology informs task decomposition and dependency ordering

**Typical agent workflow:**
1. `/ctxify` to scan workspace
2. Read AGENTS.md for orientation
3. Read relevant satellite files for current task
4. Proceed with implementation using full cross-repo understanding
