---
name: ctxify:reading-context
description: Detailed reference for progressive context loading in a ctxify workspace — file roles, loading order, and staleness detection.
---

# ctxify:reading-context — Loading Context

The main loading instructions are in the **ctxify** skill. This file provides additional detail on file roles, loading order, and staleness detection.

## Progressive Disclosure

Context is layered. Load only what your current task requires:

1. **Always load:** `.ctxify/index.md` + each `repos/{name}/overview.md` + `repos/{name}/corrections.md` + `repos/{name}/rules.md` (if they exist)
2. **When writing code in a repo:** load `repos/{name}/patterns.md` (how to build features — the primary coding reference)
3. **When working in a specific domain:** load `repos/{name}/{domain}.md` (deep dive into that area)
4. **Load only what's relevant to the current task** — do not preload all domain files

Overview files are table-of-contents hubs. Detail files are the content loaded on demand.

## File Roles

| File | When to Load |
|------|-------------|
| `index.md` | Every session — workspace overview and repo relationships |
| `repos/{name}/overview.md` | Every session for each repo you'll touch |
| `repos/{name}/corrections.md` | Every session — factual fixes to stale context |
| `repos/{name}/rules.md` | Every session — behavioral instructions and anti-patterns |
| `repos/{name}/patterns.md` | Before writing any code in that repo |
| `repos/{name}/{domain}.md` | When your task involves that specific domain |

## After Loading

If context looks stale or a `corrections.md` contradicts an overview, note it.
When you discover wrong context during a task — invoke **ctxify:corrections**.
When the user corrects your behavior — invoke **ctxify:rules**.
