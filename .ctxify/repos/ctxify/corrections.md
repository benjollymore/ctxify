---
repo: ctxify
type: domain
ctxify_version: 0.7.1
domain: corrections
---

# corrections

How agents log factual corrections, behavioral rules, and anti-patterns back into context so mistakes are not repeated across sessions.

## Overview

The corrections and feedback system is a self-healing loop: agents discover that context files are wrong or incomplete during real work, log the discrepancy via `ctxify feedback`, and the entry lands in corrections.md or rules.md where it is loaded automatically next session. The goal is that a mistake made once by one agent is not repeated by any agent.

Two shards, two concerns:

- `corrections.md` — factual corrections ("context said X, reality is Y")
- `rules.md` — behavioral rules and anti-patterns ("never do X", "always use Y")

Both are always loaded alongside overview.md so they are never missed.

## Concepts

**Segment markers** are HTML comments invisible to markdown renderers but parseable by `extractSegments()`:

```
<!-- correction:2025-06-15T10:30:00.000Z -->
Auth middleware is not global — it's applied per-route.
<!-- /correction -->
```

Format: `<!-- tag:attr1:attr2 -->...<!-- /tag -->`. The attribute after the tag name is an ISO 8601 timestamp. `extractSegments()` matches opening and closing pairs by tag name and returns body text.

Active tags validated by `validateShards`: `correction`, `antipattern`, `rule`, `question`, `domain-index`, `endpoint`, `type`, `env`, `model`.

**corrections.md** holds `<!-- correction:timestamp -->` blocks only. `ctxify feedback <repo>` appends a formatted entry using `formatCorrectionEntry()` from `src/templates/corrections.ts`. The file is created on first use if absent.

**rules.md** holds `<!-- rule:timestamp -->` blocks in its main body. Anti-patterns live below a `# Anti-Patterns` section header (inserted automatically on first antipattern). The `feedback` command routes `--type rule` and `--type antipattern` both to rules.md, corrections to corrections.md.

**The `feedback` command** is the only approved write path:

```
ctxify feedback <repo> --body "What happened / what's correct"
ctxify feedback <repo> --type rule --body "Don't fragment CSS..."
ctxify feedback <repo> --type antipattern --body "Silent catch swallows errors" --source "src/payments/handler.ts:42"
```

Never edit corrections.md or rules.md directly. The command handles timestamp generation, file creation, and section scaffolding.

## Decisions

**HTML comment markers over custom syntax.** Invisible to renderers, no special tooling needed, agents understand them natively. Markdown fenced code blocks containing example markers are stripped before validation so documentation examples don't trip the validator.

**Separate shards for corrections vs rules.** Corrections are factual ("the docs were wrong"), rules are behavioral ("do this instead"). Mixing them blurs signal. An agent fixing a bug wants to know "is this context wrong?" separately from "is there a policy about how I should behave?".

**Always loaded.** Both shards load every session without agent effort. The cost of loading two small files is lower than the cost of repeating a mistake that was already corrected.

**Timestamp as segment attribute.** ISO 8601 in the opening tag gives each entry a stable identity and natural sort order. `extractSegments()` can filter by timestamp substring if needed.

## Patterns

**Adding a new segment tag type.** Add the tag name to `SEGMENT_TAGS` in `src/core/validate.ts`. The validator will then check that every opening `<!-- newtag:... -->` has a matching `<!-- /newtag -->`. No changes needed to `extractSegments()` — it takes the tag name as a runtime argument.

**Validating markers.** `validateShards()` in `src/core/validate.ts`:
1. Strips fenced code blocks (so example markers in docs don't count).
2. Strips TODO comment blocks (same reason — TODO blocks may contain example markers).
3. Counts opening vs closing markers per tag per file.
4. Reports mismatches as errors, not warnings.

## Traps

- **Missing closing tag** — `validateShards` counts opens vs closes. One missing `<!-- /correction -->` fails the whole file. Run `ctxify validate` after any manual edit.
- **Wrong timestamp format** — the attribute must be a valid ISO 8601 string (e.g. `2025-06-15T10:30:00.000Z`). The validator does not parse it, but `extractSegments` uses it as a filter value, so malformed timestamps silently skip filters.
- **Editing the file directly** — the `feedback` command handles section scaffolding for anti-patterns (`# Anti-Patterns` header). Manual edits that skip this header leave antipattern entries in the wrong section and confuse future appends.
- **Logging rules as corrections** — a behavioral preference from the user goes in rules.md via `--type rule`. Putting it in corrections.md means it loads under the wrong heading and the skills routing users to the right shard breaks.
- **Anti-pattern bloat** — the skills cap anti-patterns at 2 per repo per session and apply a three-question bar (broad impact, learnable, real harm). The validator does not enforce this cap; enforcement is convention only.
