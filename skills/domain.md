---
name: ctxify:domain
description: Use when identifying a new complex area of a codebase that needs its own context file in a ctxify workspace.
---

# ctxify:domain — Domain Creation

## Hard Gate

Run `ctxify domain add <repo> <domain>` BEFORE writing any content. This scaffolds the file and registers it in overview.md's domain index. Never create domain files manually.

## Command

```
ctxify domain add <repo> <domain-name> [options]
```

Options:
- `--description "what it covers"` — one-line description (appears in overview.md index)
- `--tags tag1,tag2` — tags for frontmatter (optional)
- `-d, --dir <path>` — workspace directory (default: `.`)

Example:
```
ctxify domain add backend payments --description "Stripe integration and billing flows" --tags billing,stripe
```

## When to Create a Domain

Create a domain file when an area of the codebase is:
- Complex enough that an agent would need 30+ min to re-understand it from scratch
- Likely to be the focus of multiple future tasks
- Has non-obvious patterns, business rules, or cross-repo interactions

Do NOT create domain files for small, self-contained modules — a `file:line` reference from patterns.md is enough.

## What to Fill

After scaffolding, read entry points + 2-3 key files and fill the TODOs:
- **Overview**: What this domain covers, key concepts, workflow/status flows (2-3 sentences)
- **Key Files**: 5-10 most important files with 1-line descriptions and `file:line` references
- **Patterns**: Domain-specific patterns with brief examples
- **Cross-repo**: How this domain spans repos (backend model + frontend form, etc.)

Target: 50-150 lines total.
