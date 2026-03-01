---
ctxify: '2.0'
type: index
mode: single-repo
repos:
  - ctxify
scanned_at: '2026-03-01T18:30:43.088Z'
---

# ctxify

ctxify scaffolds and validates persistent context files for AI coding agents. It detects repo structure, parses manifests, and generates `.ctxify/` markdown templates that agents fill with architecture, patterns, and domain knowledge. Published as an npm CLI and library — consumed by developers setting up agent-ready workspaces and by agents loading context at session start.

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [ctxify](repos/ctxify/overview.md) | typescript | commander | CLI + library: scaffolds context, validates shards, installs agent skills |

## Relationships

Single-repo workspace — no cross-repo relationships. The CLI binary (`bin/ctxify.ts`) and the library (`src/index.ts`) share all business logic in `src/core/`. Skills in `skills/` are installed to agent-specific paths by the CLI but are not imported by the library.

## Commands

- **Build:** `npm run build` — tsup produces `dist/index.js` (library) + `dist/bin/ctxify.js` (CLI)
- **Test:** `npm test` — vitest, ~326 tests. Single file: `npx vitest run test/unit/validate.test.ts`
- **Typecheck:** `npm run typecheck` — tsc --noEmit (strict mode)
- **Dev:** `npm run dev` — tsup --watch

## Workflows

### Adding a new CLI command
1. Create `src/cli/commands/{name}.ts` with `register{Name}Command(program)` — outputs JSON to stdout
2. Register in `bin/ctxify.ts` — import and call the register function
3. Add unit tests in `test/unit/{name}.test.ts` using isolated temp dirs
4. Add integration test in `test/integration/` invoking the built binary with `execFileSync`
5. Update `README.md` Commands table

### Adding a new manifest parser (new language)
1. Add parser case in `src/core/manifest.ts` → `parseRepoManifest()` fallback chain
2. Add framework detection in the same file (deps → framework mapping)
3. Add test fixtures and unit tests in `test/unit/manifest.test.ts`
4. Template generators may need new language-specific defaults in `src/templates/`

### Adding or modifying a skill
1. Edit/create the skill file in `skills/` (SKILL.md or satellite)
2. Update `src/cli/install-skill.ts` if the skill needs special installation logic
3. Test with `ctxify init --agent claude` on a fresh workspace to verify installation paths
4. Bump version — installed skills include a version comment header
