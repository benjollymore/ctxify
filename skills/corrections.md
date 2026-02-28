---
name: ctxify:corrections
description: Use when the user corrects your behaviour or tells you not to do something, context guidance led you astray, or you discover a pattern that contradicts documented behavior in a ctxify workspace.
---

# ctxify:corrections — Logging Corrections and Anti-Patterns

## Hard Gate

ALWAYS run `ctxify feedback` — never edit `corrections.md` directly. The command appends a timestamped, structured entry.

## Corrections — when context was wrong

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

## Anti-patterns — proactive issue logging

```
ctxify feedback <repo> --type antipattern \
  --body "Silent catch swallows payment errors — never add catch-all here without re-throwing" \
  --source "src/payments/handler.ts:42"
```

**Apply the three-question bar before logging. All three must be yes:**
1. **Broad impact** — affects multiple callers, flows, or engineers (not one isolated spot)?
2. **Learnable** — would a future agent know to avoid or fix this from the entry?
3. **Real harm** — causes bugs, data loss, silent failures, or security issues in production?

**Do NOT log:**
- FIXME/HACK/XXX comments (agent can read them in source)
- Style inconsistencies or naming issues
- Isolated one-off oddities that don't recur
- Anything a future agent spots in 30 seconds by reading the file
- Technical debt that is known and accepted

**Hard cap: max 2 per repo per session.** Logging more means you're cataloging code smells, not capturing high-signal context. Stop.

## What NOT to file (either type)

- Stale TODOs — fill them directly in the context file
- Typos in docs — fix them directly
- New patterns you discovered — add to patterns.md
