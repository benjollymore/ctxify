---
name: ctxify
description: Use when working in a multi-repo workspace to get cross-repo context.
  Provides repo topology, API endpoints, shared types, env vars, and relationships.
  Call ctxify scan first, then read index.yaml, then query specific data as needed.
---

# ctxify — Workspace Context

## How to Use

### Step 1: Scan (once per session)

Run `ctxify scan --dir <workspace>` to generate/refresh context.
Then read `.ctx/index.yaml` for the workspace overview (~300 bytes).

The index tells you: repo names, languages, frameworks, endpoint counts,
relationship summary, and totals. This is enough to plan.

### Step 2: Query what you need

Use `ctxify query` to get specific data without loading everything:

| Need | Command |
|------|---------|
| Repo details | `ctxify query --repo <name> --dir <ws>` |
| API endpoints | `ctxify query --repo <name> --section endpoints --dir <ws>` |
| Shared types | `ctxify query --section types --dir <ws>` |
| Env var names | `ctxify query --repo <name> --section env --dir <ws>` |
| Relationships | `ctxify query --section topology --dir <ws>` |
| POST endpoints only | `ctxify query --section endpoints --method POST --dir <ws>` |
| Endpoints by path | `ctxify query --section endpoints --path-contains users --dir <ws>` |
| Type by name | `ctxify query --section types --name UserProfile --dir <ws>` |

### Rules

1. Always scan before querying (if you haven't this session).
2. Never read .ctx/ files directly — use `ctxify query`.
3. Query only what your current task needs. Never load everything.
4. When spawning sub-agents, include in their prompt:
   "Run `ctxify query --repo <name> --section <section> --dir <ws>`
   to get workspace context for your task."

### When to re-scan

- Run `ctxify status --dir <ws>` to check freshness (JSON output).
- Run `ctxify scan --dir <ws>` if repos are stale.
- Run `ctxify scan --force --dir <ws>` to force a full re-scan.
