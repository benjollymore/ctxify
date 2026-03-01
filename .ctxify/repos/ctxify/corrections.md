---
repo: ctxify
type: domain
domain: corrections
---

# corrections

The feedback loop: how agents log factual corrections, behavioral rules, and anti-patterns back into context files. The `ctxify feedback` command is the single entry point — agents never edit corrections.md or rules.md directly. This domain covers the three entry types, the file routing, segment marker format, and how validation keeps entries structurally sound.

## Concepts

Three entry types, two destination files:

| Type | Destination | Segment tag | Purpose |
|------|-------------|-------------|---------|
| `correction` | `corrections.md` | `correction:timestamp` | Factual error in context — "docs say X, reality is Y" |
| `rule` | `rules.md` | `rule:timestamp` | Behavioral instruction — "always/never do X" |
| `antipattern` | `rules.md` | `antipattern:timestamp` | Proactive code issue — "this pattern causes harm" |

Corrections are factual (wrong context cost time). Rules are behavioral (user preference or convention). Anti-patterns are proactive (agent-discovered code issues that meet the three-question bar: broad impact, learnable, real harm).

Both files are **always-loaded** — the SessionStart hook and the main ctxify skill load them every session alongside overview.md. This means entries accumulate in context budget permanently. The anti-pattern hard cap (max 2 per repo per session) exists because of this cost.

## Data flow

1. Agent invokes `ctxify feedback <repo> --body "..." [--type correction|rule|antipattern] [--source file:line]`
2. `feedback.ts` validates repo against `ctx.yaml`, resolves output dir
3. If target file doesn't exist, creates it from template (`generateCorrectionsTemplate` or `generateRulesTemplate`)
4. Formats entry with timestamp, appends (with segment markers) to the file
5. Outputs JSON confirmation with `status: "recorded"`

Anti-patterns get special handling: if `rules.md` doesn't yet have an `# Anti-Patterns` header, it's injected before the first entry.

## Segment markers

Every entry is wrapped in HTML comment segment markers:

```markdown
<!-- correction:2025-06-15T10:30:00.000Z -->
Auth middleware is not global — it's applied per-route.
<!-- /correction -->
```

This enables `extractSegments()` to pull entries by tag without reading the full file. The timestamp attribute is the only attribute — used for ordering, not filtering. Validation (`checkSegmentMarkers` in `validate.ts`) ensures opening/closing markers are balanced across all `SEGMENT_TAGS`: correction, antipattern, rule, plus domain-index, question, and the legacy endpoint/type/env/model tags.

## Decisions

**Append-only, never edit directly.** The `ctxify feedback` command is the hard gate. This ensures consistent formatting, timestamping, and segment marker structure. If agents edited files directly, marker mismatches and formatting drift would accumulate.

**Two files, not one.** Corrections (factual) and rules (behavioral) serve different purposes. Corrections say "the context was wrong." Rules say "do/don't do this." Mixing them would make it harder for agents to distinguish between "my understanding is wrong" and "my behavior should change."

**Anti-patterns live in rules.md, not corrections.md.** Anti-patterns are behavioral guidance ("avoid this pattern") not factual corrections. They share `rules.md` but get their own section header and segment tag.

**Always-loaded means budget pressure.** Both files are in the "every session" load set. The three-question bar for anti-patterns and the 2-per-session cap are budget controls — without them, agents would log every code smell they encounter.

## Traps

- The `--type` flag defaults to `correction` — forgetting `--type rule` silently logs a behavioral instruction as a factual correction in the wrong file
- `formatAntiPatternEntry` appends ` — \`source\`` inline when `--source` is provided, but `formatCorrectionEntry` ignores `--source` entirely — corrections don't support source references
- The anti-patterns section header is only injected on first antipattern entry — if someone manually deletes it, subsequent entries still append but without the header
- `validate.ts` checks marker balance but not marker content — an empty `<!-- correction:timestamp --><!-- /correction -->` passes validation
