---
repo: ctxify
type: patterns
---

# How to Build Features

How we build features here — the patterns and conventions that aren't obvious from reading one file.

**Pattern:** Commands are registered in `bin/ctxify.ts` (e.g., `registerInitCommand(program)`), implemented in `src/cli/commands/*.ts`. Command handler receives typed options, calls business logic (e.g., `scaffoldWorkspace()` from `src/core/`), outputs JSON to stdout. Template generators in `src/templates/` take typed data and return markdown strings (pure functions, no I/O). File writing happens only in command handlers or orchestrator functions. Example: `ctxify init` → `registerInitCommand()` → `scaffoldWorkspace()` → `parseRepoManifest()` (reads manifest) → `generateRepoTemplate()` (returns string) → `writeFileSync()` (writes to disk).

## Validation

`validateShards()` checks three things: (1) index.md exists with valid YAML frontmatter, (2) segment markers are balanced (e.g., `<!-- endpoint:GET:/users -->...<!-- /endpoint -->`), (3) domain files listed in overview.md exist on disk. Returns `{valid, errors[], warnings[]}`. Errors are structural (missing files, bad frontmatter). Warnings are content issues (TODO markers still present).

## Testing

Every test creates a temp directory in `beforeEach()` and cleans up in `afterEach()` — no test depends on another. For scaffold tests: use `mkdtempSync()`, write test fixtures (e.g., `package.json`), call the function, assert files exist and have correct content. For manifest tests: create a temp repo with a manifest file, call `parseRepoManifest()`, assert the result fields match expectations. Integration tests invoke the built CLI with `execFileSync()` and verify JSON output and side effects.

## Naming Conventions

- **Commands:** kebab-case (e.g., `context-hook`, `domain`, `install-skill`)
- **Functions:** camelCase. Prefixes signal intent: `parse*` (read + transform), `validate*` (check + return errors), `detect*` (infer from filesystem), `generate*` (templates), `register*` (CLI registration)
- **Types:** PascalCase. Suffixes: `*Result` (return type), `*Options` (input), `*Data` (template input)
- **Files:** kebab-case for utilities (`install-skill.ts`), PascalCase for class-like files, lowercase for domain modules
- **Markdown YAML:** snake_case (e.g., `ctxify: "2.0"`, `scanned_at`)

## Gotchas

- **Manifest parsing is fallback-based:** tries package.json → go.mod → pyproject.toml → requirements.txt. First found wins. Returns empty defaults (`language: '', framework: ''`) if none found — agents need to handle this gracefully.
- **Interactive vs. flags:** `ctxify init` without `--repos`/`--mono` flags and with a TTY stdin enters interactive mode (`runInteractiveFlow()`). Non-TTY or flag-provided bypasses prompts. Both call the same `scaffoldWorkspace()`.
- **All repos must be subdirectories of workspace root:** Simplifies path resolution. Enforced implicitly in most code; violations cause path issues in manifest parsing.
- **Skills are installed before ctx.yaml is written:** This allows skill paths to be stored in ctx.yaml. If skill install fails, workspace is left partially initialized.
- **Template generators are imported in commands, not in core:** Keep core modules pure. CLI commands handle all imports and file I/O to enable testing of core logic without mocking.
