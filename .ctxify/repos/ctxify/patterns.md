---
repo: ctxify
type: patterns
---

# How to Build Features

How we build features here — the patterns and conventions that aren't obvious from reading one file.

## End-to-End Feature Flow

New features follow: (1) Register handler in `src/cli/commands/` → (2) Export `register${Command}Command()` → (3) Import and call in `bin/ctxify.ts` preAction hook → (4) Handler loads config, validates repo, builds result, calls `console.log(JSON.stringify(result))` → (5) All commands output JSON for agent parseability. Example: adding a new `ctxify foo <repo>` command: (a) create `src/cli/commands/foo.ts` with `registerFooCommand(program)` handler, (b) handler loads config via `loadConfig()`, validates repo via `config.repos.find()`, calls template if needed, writes files, (c) handler outputs JSON with result object, (d) import + call in bin/ctxify.ts. Test: create temp workspace with `ctx.yaml`, invoke CLI via `execFileSync`, parse JSON output.

## Validation

Validation is split: config validation (yaml schema) in `src/core/config.ts`, shard validation (markdown structure) in `src/core/validate.ts`. Config validators are pure functions per field (validateMode, validateRepos, etc.) that throw `ConfigError` on failure. Shard validation checks: (1) index.md exists, (2) valid frontmatter, (3) segment markers balanced (domain-index, correction, rule, etc.), (4) no unclosed TODO blocks. Segment extraction uses regex with filter support: `extractSegments(content, 'domain-index', { index: 0, value: 'myfunction', exact: true })` returns segment bodies matching attribute 0. File I/O validation is minimal — only frontmatter parsing and marker balance, no semantic checks.

## Testing

All tests create temp directories in `beforeEach` and clean up in `afterEach` using mkdtempSync + rmSync. No cross-test dependencies. Integration tests invoke the built CLI binary via `execFileSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf-8' })` and parse JSON output. Unit tests call functions directly with mock data. File I/O tests build minimal workspaces: write ctx.yaml with `serializeConfig()`, create repo dirs, invoke ctxify command, verify output exists. Helper pattern: `makeTmpDir()` + `createWorkspace()` setup, then test assertion on file existence or config structure.

## Naming Conventions

Commands: `register${PascalCase}Command(program)` exports a function that takes the Commander program and calls `.command()`, e.g., `registerPatternsCommand()`, `registerFeedbackCommand()`. Error types: `${Description}Error` extending `CtxifyError`, e.g., `ConfigError`, `GitError`. Template generators: `generate${PascalCase}Template()` pure function returning string. Type interfaces: `${Concept}Data` for template input, `${Concept}Result` for command output, e.g., `PatternsTemplateData`, `ValidationResult`. Files: one per domain/concern. Domain files named lowercase with dashes: `init.md`, `manifest-detection.md`, `skill-installation.md`.

## Gotchas

**Config YAML is source of truth.** ctx.yaml is always written by `scaffoldWorkspace()`, not read and patched. Any new field in config must be added to validation in `src/core/config.ts` before deployment. **Template generators have no side effects.** Don't add fs.writeFileSync inside template generators — they're pure. Init command handles all writes. **Segment markers strip from TODO blocks during validation.** `validateShards()` strips `<!-- TODO:... -->` blocks before checking segment balance so example markers in TODOs don't cause false errors. **Multi-file agents don't share state across skills.** Claude Code, Cursor install 7 separate files — they don't read each other. Keep cross-skill references simple. **Manifest parsing is a fallback chain.** If package.json exists but is malformed, other manifests won't be tried. Catch JSON errors in `parseRepoManifest()`. **Tests must run in isolation.** Don't assume built dist/ exists — some test runs do `npm run build` first. Always check CLI_PATH exists before invoking.
