---
name: ctxify:startup
description: Use when context files need to be checked for completeness, re-initialized, or troubleshot in a ctxify workspace.
---

# ctxify:startup — Session Start

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

Check the user's intent from the conversation:

- **User explicitly requested context setup** (e.g., "set up context", "fill context", "/ctxify", "initialize context") → Proceed directly: invoke **ctxify:filling-context**. No need to ask.
- **Startup was triggered automatically** (e.g., session start hook, or you invoked startup as a prerequisite before a different task) → Ask briefly:
  > "Context files are unfilled. Fill them now, or skip and start on your task?"
  - **If yes** → invoke **ctxify:filling-context** to read the codebase and fill in the templates.
  - **If no** → proceed as if context is filled: load the existing files and note that TODO markers indicate sections that are still unfilled.
