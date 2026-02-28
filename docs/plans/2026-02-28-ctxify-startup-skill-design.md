# Design: ctxify-startup skill

**Date:** 2026-02-28
**Branch:** refactor/operational-context-audit
**Status:** Approved

## Problem

The session hook currently outputs corrections/rules and nudges the agent to invoke `/ctxify-reading-context`. But `/ctxify-reading-context` assumes context is already filled — it just tells the agent which files to load. In practice, when context files are empty TODO stubs (fresh ctxify init), the reading-context skill gives no value and the agent silently finds nothing useful.

## Goal

The session startup flow should detect whether context has been filled and respond appropriately:
- Filled → load context (current behaviour)
- Unfilled → prompt the user to run `/ctxify-filling-context`

## Design

### New skill: `skills/startup.md` (invoked as `/ctxify-startup`)

This becomes the single session entry point, replacing `/ctxify-reading-context` in the hook nudge.

**Logic:**

1. Read `.ctxify/repos/*/overview.md` for each repo
2. Detect state: if any overview.md contains `<!-- TODO:` markers → context is unfilled
3. Branch:
   - **Filled** → follow `ctxify:reading-context` behaviour (load corrections.md, rules.md, overview.md; load patterns.md and domain files on demand)
   - **Unfilled** → tell the user: "ctxify context files have unfilled templates. Would you like me to fill them now using /ctxify-filling-context? This will read the codebase and document architecture, patterns, and conventions." Then wait for user response.

`ctxify-reading-context` remains unchanged for direct invocation when context is known to be filled.

### Hook nudge message change

`src/cli/commands/context-hook.ts` — update the nudge from:
```
ctxify workspace detected. Invoke /ctxify-reading-context to load patterns and domain context before starting work.
```
to:
```
ctxify workspace detected. Invoke /ctxify-startup to initialize context for this session.
```

## Files Changed

| File | Type | Change |
|------|------|--------|
| `skills/startup.md` | New | Session entry point skill |
| `src/cli/commands/context-hook.ts` | Edit | Update nudge message string |
| `test/unit/context-hook.test.ts` | Edit | Update nudge message assertions |
| `test/unit/install-skill.test.ts` | Edit | Update skill file count 7 → 8 |

`install-skill.ts` reads all files from `skills/` automatically — no code change needed there.

## Out of Scope

- Partial fill detection (only checking overview.md for TODOs, not individual domain files)
- Auto-filling without user confirmation
- Changes to `ctxify-reading-context` skill
