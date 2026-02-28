---
ctxify: '2.0'
mode: single-repo
repos:
  - ctxify
scanned_at: '2026-02-28T23:01:00.977Z'
---

# ctxify

Scaffolder + validator that builds persistent workspace context for AI coding agents. Parses manifests and scaffolds markdown templates; agents fill semantic content. Single-repo workspace — ctxify is both the tool and its own dogfood.

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [ctxify](repos/ctxify/overview.md) | typescript | commander | CLI tool + library |

## Relationships

Single-repo workspace — no cross-repo relationships. The library export (`src/index.ts`) exposes config, manifest, validate, detect, frontmatter, and segments for programmatic use, but there are no downstream consumers in this workspace.

## Commands

- **Build:** `npm run build` (tsup → dist/index.js + dist/bin/ctxify.js)
- **Test:** `npm test` (vitest run). Single file: `npx vitest run test/unit/<file>.test.ts`
- **Typecheck:** `npm run typecheck` (tsc --noEmit, strict mode)
- **Dev:** `npm run dev` (tsup --watch)

## Workflows

**Adding a new CLI command:** Create handler in `src/cli/commands/<name>.ts` with `register${Name}Command(program)` export → import and call in `bin/ctxify.ts` → add test in `test/unit/` or `test/integration/` → update README Commands table.

**Adding a new template:** Create pure generator function in `src/templates/<name>.ts` → define typed data interface → call from the relevant command handler → generator has no I/O, command handles file writes.

**Adding manifest support for a new language:** Extend fallback chain in `src/core/manifest.ts` → add framework detection via dependency scanning → add entry point discovery logic → add test fixtures in `test/unit/manifest.test.ts`.
