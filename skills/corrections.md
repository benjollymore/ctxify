---
name: ctxify:corrections
description: Use when context guidance led you astray, or you discover a pattern that contradicts documented behavior in a ctxify workspace.
---

# ctxify:corrections — Logging Corrections

## Hard Gate

ALWAYS run `ctxify feedback <repo> --body "..."` — never edit `corrections.md` directly. The command appends a timestamped entry in the correct format.

## Command

```
ctxify feedback <repo> --body "## Wrong assumption about auth middleware
What happened: Followed the documented pattern X, but it actually works as Y.
What's correct: file:line shows the actual implementation.
Why it matters: This affects every authenticated route."
```

## When to File

File a correction when:
- Context guidance led you astray and cost real time
- A pattern in patterns.md or a domain file contradicts actual code behavior
- A cross-repo interaction works differently than described
- A documented assumption is wrong

## Format Guidance

Each correction should include:
- **What happened**: What you tried based on documented guidance
- **What's correct**: The actual behavior, with `file:line` references
- **Why it matters**: What this affects and why future agents should know

Keep corrections focused. One issue per entry.

## What NOT to File

- Stale TODOs — fill them directly in the context file
- Typos in docs — fix them directly
- New patterns you discovered — add to patterns.md
- Questions or uncertainties — figure it out first, then file if it was wrong
