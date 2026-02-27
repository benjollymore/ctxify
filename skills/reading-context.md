---
name: ctxify:reading-context
description: Use when loading context files from a ctxify workspace before starting a task.
---

# ctxify:reading-context — Loading Context

## Hard Gate

ALWAYS load `corrections.md` before starting any task (if it exists). It contains documented mistakes that will save you time.

## Progressive Disclosure

Context is layered. Load only what your current task requires:

1. **Always load:** `.ctxify/index.md` + each `repos/{name}/overview.md` + `repos/{name}/corrections.md` (if exists)
2. **When writing code in a repo:** load `repos/{name}/patterns.md` (how to build features — the primary coding reference)
3. **When working in a specific domain:** load `repos/{name}/{domain}.md` (deep dive into that area)
4. **Load only what's relevant to the current task** — do not preload all domain files

Overview files are table-of-contents hubs. Detail files are the content loaded on demand.

## File Roles

| File | When to Load |
|------|-------------|
| `index.md` | Every session — workspace overview and repo relationships |
| `repos/{name}/overview.md` | Every session for each repo you'll touch |
| `repos/{name}/corrections.md` | Every session — documented mistakes and corrections |
| `repos/{name}/patterns.md` | Before writing any code in that repo |
| `repos/{name}/{domain}.md` | When your task involves that specific domain |

## After Loading

If context looks stale or a `corrections.md` contradicts an overview, note it.
When you discover wrong context during a task — invoke **ctxify:corrections**.
