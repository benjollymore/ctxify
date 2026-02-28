---
name: ctxify
description: Use when starting work in any ctxify-managed workspace. Detects context scaffolding, runs init if needed, and hands off to focused skills.
---

# ctxify — Orientation

## Hard Gate

ALWAYS check for `.ctxify/` before writing code in any workspace. If absent, stop and initialize.

## Detection

Check for `.ctxify/index.md` at workspace root.
- **Found** → Invoke **ctxify:startup** to detect context state and load appropriately.
- **Not found** → Check for `ctx.yaml`. If exists, run `ctxify init`. If neither, go to First-time Setup below.

Do not look for context files inside individual repos unless referenced from `.ctxify/`.

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

- **Reading context** → invoke `ctxify:reading-context`
- **Filling/writing context files** → invoke `ctxify:filling-context`
- **Creating a new domain file** → invoke `ctxify:domain`
- **Logging a correction** → invoke `ctxify:corrections`
- **Cross-repo branch/commit coordination** → invoke `ctxify:multi-repo`
