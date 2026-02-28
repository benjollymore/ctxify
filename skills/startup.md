---
name: ctxify:startup
description: Use at session start in a ctxify workspace to detect whether context files are filled or need to be written, then hand off to the appropriate skill.
---

# ctxify:startup — Session Start

## Hard Gate

ALWAYS run this check before starting any task in a ctxify workspace. Do not skip to reading-context directly — this skill ensures context is in a usable state first.

## Step 0: Check for workspace initialisation

Check whether `.ctxify/index.md` exists at the workspace root.

If it does **not** exist: stop here. Tell the user to run `ctxify init` first, or follow the **ctxify** orientation skill. Do not proceed until the workspace is initialised.

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

- **If yes** → invoke **ctxify:filling-context** to read the codebase and fill in the templates.
- **If no** → proceed as if context is filled: load the existing files and note that TODO markers indicate sections that are still unfilled.
