---
ctxify: '2.0'
mode: single-repo
repos:
  - ctxify
scanned_at: '2026-03-01T02:15:35.512Z'
---

# ctxify

ctxify scaffolds and validates workspace context for AI coding agents. It handles the mechanical parts (manifest parsing, framework detection, template generation) so agents can focus on semantic analysis — reading source code and documenting architecture, patterns, and decisions. Output is CLAUDE.md-style markdown consumed by Claude Code, Copilot, Cursor, and Codex.

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [ctxify](repos/ctxify/overview.md) | typescript | commander | CLI tool + library |

## Relationships

Single-repo workspace — no cross-repo relationships. The CLI (`bin/ctxify.ts`) and library (`src/index.ts`) share the same core modules. Skills in `skills/` are read at install time and written to agent-specific paths.

## Commands

- **Build:** `npm run build` (tsup → `dist/index.js` + `dist/bin/ctxify.js`)
- **Test:** `npm test` (vitest, ~279 tests) · `npx vitest run test/unit/<file>.test.ts` for one file
- **Typecheck:** `npm run typecheck` (tsc --noEmit, strict mode)
- **Dev:** `npm run dev` (tsup --watch)

## Workflows

**Adding a new CLI command:**
1. Create `src/cli/commands/<name>.ts` with a `register<Name>Command(program)` function
2. Add business logic in `src/core/` if non-trivial (keep command handler thin)
3. Register in `bin/ctxify.ts` — import and call the register function
4. Add tests in `test/unit/` (unit) and `test/integration/` (CLI invocation)
5. Update README.md commands table

**Adding a new template:**
1. Create pure function in `src/templates/` — takes typed data, returns markdown string
2. Define the input type (e.g., `FooTemplateData`) in the same file or `src/types.ts`
3. Call from the relevant command handler — template generates, command writes

**Supporting a new agent:**
1. Add entry to `AGENT_CONFIGS` in `src/cli/install-skill.ts` with destDir, primaryFilename, frontmatter generator
2. Choose multi-file or single-file strategy based on agent capabilities
3. Add to interactive init's agent checkbox list in `src/cli/commands/init.ts`
4. Test with `ctxify init --agent <name>` and verify file placement

**Adding a new manifest type (e.g., Cargo.toml):**
1. Add detection in `parseRepoManifest()` fallback chain (`src/core/manifest.ts`)
2. Add framework indicators to `FRAMEWORK_INDICATORS` map
3. Implement entry point discovery for the language
4. Add test fixtures and unit tests
