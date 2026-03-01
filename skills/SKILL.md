---
name: ctxify
description: Use before writing, modifying, or debugging code in a ctxify workspace — loads architecture, patterns, and coding conventions so you build correctly.
---

# ctxify — Load Context Before Coding

## Before Starting Any Task

Check for `.ctxify/index.md` at workspace root.

- **Not found** → Check for `ctx.yaml`. If exists, run `ctxify init`. If neither, go to First-time Setup below.
- **Found** → Continue to "Check Context State".

Do not look for context files inside individual repos unless referenced from `.ctxify/`.

## Check Context State

Read `.ctxify/index.md` and each `repos/{name}/overview.md`.

If any overview.md contains `<!-- TODO:` markers, context is **unfilled**:
- User explicitly requested context setup (e.g., "set up context", "/ctxify") → proceed directly: invoke **ctxify:filling-context**.
- Startup was auto-triggered (session hook, prerequisite) → ask briefly: "Context files are unfilled. Fill them now, or skip and start on your task?"

If no TODO markers → context is filled. Continue to "Load Context Files".

## Load Context Files

| File | Load when |
|------|-----------|
| `.ctxify/index.md` | Every session |
| `repos/{name}/overview.md` | Every session |
| `repos/{name}/corrections.md` | Every session — past mistakes to avoid |
| `repos/{name}/rules.md` | Every session — behavioral instructions |
| `repos/{name}/patterns.md` | Before writing or modifying code |
| `repos/{name}/{domain}.md` | When working in that specific domain |

Read the "Every session" files now. Load patterns.md and domain files when you reach a coding task that needs them.

**Claude Code note:** The SessionStart hook pre-loads always-load files (index.md, overview.md, corrections.md, rules.md) into context automatically. If you see this content already in session context, skip to loading patterns.md and domain files as needed.

If context looks stale or a `corrections.md` contradicts an overview, note it.
When you discover wrong context during a task — invoke **ctxify:corrections**.
When the user corrects your behavior — invoke **ctxify:rules**.

## First-time Setup

All repos must be subdirectories of the workspace root. Run ctxify from that root.

| Layout | Command |
|--------|---------|
| Single manifest at root only | `ctxify init` |
| Root manifest with `workspaces` field | `ctxify init --mono` |
| Multiple subdirs with manifests | `ctxify init --repos ./a ./b ./c` |

Add `--agent claude` (or copilot/cursor/codex) to install agent playbooks alongside scaffolding.

After init — invoke **ctxify:filling-context** to document what you learn about the codebase.

## Handoffs

- **Filling/writing context files** → invoke `ctxify:filling-context`
- **Creating a new domain file** → invoke `ctxify:domain`
- **Logging a correction** → invoke `ctxify:corrections`
- **Logging a behavioral rule** → invoke `ctxify:rules`
- **Cross-repo branch/commit coordination** → invoke `ctxify:multi-repo`
