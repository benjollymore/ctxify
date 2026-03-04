---
name: ctxify:domain
description: Use when identifying a new complex area of a codebase that needs its own context file in a ctxify workspace.
---

# ctxify:domain — Domain Creation

## Hard Gate

Run `ctxify domain add <repo> <domain> --description "..."` BEFORE writing any content. This scaffolds the file and registers it in overview.md's domain index. Never create domain files manually.

**The command takes exactly 2 positional args** (`<repo>` and `<domain>`). The description MUST be passed via the `--description` flag — not as a third positional argument.

```
# CORRECT:
ctxify domain add backend payments --description "Stripe integration and billing flows"

# WRONG — "Stripe integration..." is treated as a third positional arg:
ctxify domain add backend payments "Stripe integration and billing flows"
```

## Command

```
ctxify domain add <repo> <domain-name> --description "what it covers" [options]
```

Options:
- `--description "what it covers"` — one-line description (appears in overview.md index). Pass via flag, not positional arg.
- `--tags tag1,tag2` — tags for frontmatter (optional)
- `-d, --dir <path>` — workspace directory (default: `.`)

## When to Create a Domain

**Before starting a feature in an undocumented domain area, create its domain file first.** Check overview.md's domain index — if the area you're about to work in isn't listed and is complex enough that understanding it requires reading 3+ files, scaffold the domain file now:

```
ctxify domain add <repo> <domain> --description "what it covers"
```

Then read entry points + 2-3 key files and fill it. This captures your understanding before you start coding — don't defer to a separate context-filling session.

Create a domain file when an area is:
- Complex enough that an agent would need 30+ min to re-understand it from scratch
- Likely to be the focus of multiple future tasks
- Has non-obvious patterns, business rules, or cross-repo interactions

Do NOT create domain files for small, self-contained modules — a `file:line` reference from patterns.md is enough.

## What to Fill

After scaffolding, read entry points + 2-3 key files and fill the TODOs:
- **Overview**: What this domain covers, key concepts, 2-3 sentences
- **Concepts**: Key domain concepts, business rules, status/state flows. What does someone need to know to work here?
- **Decisions**: Why is it built this way? What constraints or trade-offs shaped the design?
- **Patterns**: How contributors extend or modify this domain — internal patterns with brief code examples
- **Cross-repo**: How this domain spans repos (backend model + frontend form, etc.)

Target: 50-150 lines total.
