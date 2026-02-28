---
name: ctxify:startup
description: Use when starting work in any ctxify-managed workspace. Detects context scaffolding, runs init if needed, and hands off to focused skills.
---

# ctxify:startup — Session Start

## Step 1: Read workspace context files

Read `.ctxify/index.md` and `.ctxify/repos/*/overview.md` for each repo in the workspace.

## Step 2: Detect context state

Check each overview.md for `<!-- TODO:` markers.

- **Context is filled** — overview.md has no TODO markers
- **Context is unfilled** — overview.md contains TODO markers

## If context is filled

Follow **ctxify:reading-context**: load `corrections.md`, `rules.md`, and `overview.md` for each repo you'll touch. Load `patterns.md` and domain files only when relevant to the current task.

## If context is unfilled

Tell the user:

> "The ctxify context files for this workspace have unfilled templates — architecture, patterns, and conventions haven't been documented yet. Would you like me to fill them now? I'll read the codebase and document what I find using **/ctxify-filling-context**."

Wait for the user to respond before doing anything else.
