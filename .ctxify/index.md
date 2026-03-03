---
type: index
ctxify_version: 0.7.1
mode: single-repo
repos:
  - ctxify
scanned_at: '2026-03-03T01:19:11.826Z'
---

# ctxify

Persistent workspace context for AI coding agents. ctxify scaffolds `.ctxify/` directories with markdown templates, then agents fill semantic content (architecture, patterns, domain knowledge) by reading source. The output captures a senior engineer's mental model — not catalogs of endpoints or schemas.

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [ctxify](repos/ctxify/overview.md) | typescript | commander | CLI + library for scaffolding and validating agent context |

## Relationships

Single-repo workspace — no cross-repo relationships. The CLI (`bin/ctxify.ts`) and library (`src/index.ts`) share the same core, but are bundled separately by tsup. The eval harness (`eval/`) is a standalone consumer that imports nothing from `src/` — it runs via `tsx` against real repos.

## Commands

- `npm run build` — tsup produces `dist/index.js` (library) + `dist/bin/ctxify.js` (CLI)
- `npm test` — vitest, ~380 tests. `npx vitest run test/unit/foo.test.ts` for a single file.
- `npm run typecheck` — tsc --noEmit (strict mode)
- `npm run eval` — runs eval harness via tsx (requires `ANTHROPIC_API_KEY`)

## Workflows

**Adding a CLI command:**
1. Create handler in `src/cli/commands/mycommand.ts` — export `registerMyCommandCommand(program)`
2. Register in `bin/ctxify.ts` — import and call the register function
3. Add unit tests in `test/unit/mycommand.test.ts`, integration tests in `test/integration/`
4. All output via `console.log(JSON.stringify(...))`, errors via `JSON.stringify({ error })` + `process.exit(1)`

**Adding a context template:**
1. Create pure function in `src/templates/mytemplate.ts` — data in, string out
2. Call from the relevant command in `src/cli/commands/`
3. Test template output in `test/unit/`

**Adding an eval task:**
1. Add `EvalTask` to `eval/tasks.ts` with rubric criteria, source files, and context files
2. Run `npm run eval -- --task my-task-id` to test
3. Ensure `contextFiles` includes `patterns.md` for fair with-context comparisons

**Modifying shard validation/audit rules:**
1. Validation logic in `src/core/validate.ts`, audit heuristics in `src/core/audit.ts`
2. Templates that generate the shards live in `src/templates/` — keep them in sync
3. Run `npm test` — validation tests are extensive (~380 tests across 27 files)
