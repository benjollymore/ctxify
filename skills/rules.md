---
name: ctxify:rules
description: Use when the user corrects your behaviour, tells you not to do something, or you discover a systemic anti-pattern in a ctxify workspace.
---

# ctxify:rules — Behavioral Rules and Anti-Patterns

## Hard Gate

ALWAYS run `ctxify feedback` with `--type rule` or `--type antipattern` — never edit `rules.md` directly.

## User Rules — when the user instructs behavior

```
ctxify feedback <repo> --type rule --body "Don't fragment CSS into modules — keep styles colocated with components"
```

File a rule when the user:
- Says "don't do X" or "always do Y"
- Corrects your approach (not factual context, but behavioral preference)
- Establishes a workflow or convention

Each entry: **what to do (or not do)** and **why** (if given).

## Anti-patterns — proactive issue logging

```
ctxify feedback <repo> --type antipattern \
  --body "Silent catch swallows payment errors — never add catch-all here without re-throwing" \
  --source "src/payments/handler.ts:42"
```

**Apply the three-question bar before logging. All three must be yes:**
1. **Broad impact** — affects multiple callers, flows, or engineers?
2. **Learnable** — would a future agent know to avoid this from the entry?
3. **Real harm** — causes bugs, data loss, silent failures, or security issues?

**Do NOT log:**
- FIXME/HACK/XXX comments (agent reads them in source)
- Style inconsistencies or naming issues
- Isolated one-off oddities that don't recur
- Technical debt that is known and accepted

**Hard cap: max 2 anti-patterns per repo per session.**

## What NOT to File Here

- **Wrong context** ("context said X, reality is Y") → use **ctxify:corrections** instead
- Stale TODOs — fill them directly in the context file
- New patterns you discovered — add to patterns.md
