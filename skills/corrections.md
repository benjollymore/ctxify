---
name: ctxify:corrections
description: Use when context guidance led you astray or you discover that a documented pattern contradicts actual code behavior in a ctxify workspace.
---

# ctxify:corrections — Logging Factual Corrections

## Hard Gate

ALWAYS run `ctxify feedback` — never edit `corrections.md` directly. The command appends a timestamped, structured entry.

## When to File a Correction

```
ctxify feedback <repo> --body "## Wrong assumption about auth middleware
What happened: Followed the documented pattern X, but it actually works as Y.
What's correct: file:line shows the actual implementation.
Why it matters: This affects every authenticated route."
```

File a correction when:
- Context guidance led you astray and cost real time
- A pattern in patterns.md or a domain file contradicts actual code behavior
- A cross-repo interaction works differently than described

Each entry: **what happened**, **what's correct** (`file:line`), **why it matters**.

## What NOT to File Here

- **Behavioral rules** ("don't do X", "always use Y") → use **ctxify:rules** instead
- **Anti-patterns** (systemic issues in the code) → use **ctxify:rules** instead
- Stale TODOs — fill them directly in the context file
- Typos in docs — fix them directly
- New patterns you discovered — add to patterns.md
