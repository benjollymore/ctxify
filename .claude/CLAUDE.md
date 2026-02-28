# ctxify

Turbocharged workspace context for AI coding agents.

ctxify is a **scaffolder + validator**, not an analyzer. `ctxify init` detects repos, parses manifests (language, framework, deps, entry points), and scaffolds `.ctxify/` with CLAUDE.md-style markdown templates. The calling agent reads source code and fills in semantic content: architecture descriptions, coding patterns, domain knowledge, cross-repo relationships. `ctxify validate` checks structural integrity of the filled shards.

The key insight: mechanical extraction (parsing package.json, counting files, detecting frameworks) is deterministic and cheap. Semantic analysis (understanding architecture, patterns, and conventions) requires reading code — which agents already do well. ctxify handles the first part; agents handle the second. The output captures a senior engineer's mental model — not exhaustive catalogs of endpoints, schemas, or env vars.

## Quick reference

Default branch is `main`. PRs target `main`.

```
npm run build        # tsup → dist/index.js (library) + dist/bin/ctxify.js (CLI)
npm test             # vitest run — 266 tests, 22 files
npm run typecheck    # tsc --noEmit (strict mode)
npm run dev          # tsup --watch
```

**When using ctxify as a tool on this repo** (e.g. `ctxify patterns ctxify`), use the globally installed `ctxify` command — not `node dist/bin/ctxify.js`. The `dist/bin/ctxify.js` path is for integration tests and local development of ctxify itself.

Run a specific test file:
```
npx vitest run test/unit/validate.test.ts
```

## Architecture

```
bin/ctxify.ts                    CLI entry (Commander.js, registers commands)
    ↓
src/cli/commands/*.ts            Command handlers (init, status, validate, branch, commit, domain, patterns, feedback, context-hook)
    ↓
src/core/*.ts                    Business logic (config, manifest, validate, detect)
src/templates/*.ts               Markdown template generators
    ↓
src/utils/*.ts                   Shared utilities (fs, git, yaml, frontmatter, segments)
```

The library is also exported from `src/index.ts` for programmatic use (config, manifest, validate, detect, frontmatter, segments).

## Source layout

Business logic lives in `src/core/` (config, manifest parsing, validation, detection). CLI commands in `src/cli/commands/` — one file per command, each registering with Commander.js. Template generators in `src/templates/` — pure functions taking typed data, returning markdown strings. Shared utilities in `src/utils/` (fs, git, yaml, frontmatter, segments). Tests mirror source structure in `test/unit/` and `test/integration/`.

The skill installer (`src/cli/install-skill.ts`) and hook installer (`src/cli/install-hooks.ts`) handle agent-specific file placement and Claude Code SessionStart hook management.

## Design decisions

These reflect deliberate choices. Don't reverse without understanding why they were made.

**Operational over mechanical.** Context files document *why* things are the way they are, *who* uses them, *what* decisions shaped them, and *what* traps to avoid. They do not document *how* the code is structured — agents discover structure by reading source. Templates ask for briefings, not inventories. Skills enforce this through STOP rules and positive WRITE rules.

**Agent-native architecture.** ctxify scaffolds templates; agents fill semantic content. No regex-based analysis passes. The previous architecture (v1) used 8 regex passes to extract endpoints, types, env vars, etc. The output was machine-shaped data that agents had to parse. v2 flips this: output is markdown that agents read naturally, and agents do the analysis directly on source code.

**Markdown with YAML frontmatter.** Shards are `.md` files, not `.yaml` or `.json`. Agents understand prose better than structured data. YAML frontmatter gives structured metadata where needed (totals, mode, timestamps) without sacrificing readability.

**HTML comment segment markers.** `<!-- tag:attrs -->...<!-- /tag -->` enables targeted extraction without reading entire files. Invisible to markdown renderers. Proven to work well as LLM context optimization — agents can request specific segments instead of consuming entire shards.

**Interactive by default, flags for agents.** `ctxify init` is interactive when run from a TTY (prompts for agent, mode, repos). Flags (`--repos`, `--mono`) bypass interactivity for agent/CI use. Both paths call the same `scaffoldWorkspace()` function.

**All repos must be subdirectories of workspace root.** This constraint simplifies path resolution and makes the mental model clear. ctxify always runs from the root.

**CLAUDE.md-style output.** Output captures what a senior engineer carries in their head: architecture, patterns, key dirs, domains. No endpoint catalogs, schema dumps, or env var lists. Agents read source files directly when they need specifics.

**Directory per repo** (`repos/{name}/`). Enables agent-created domain files as siblings to the scaffolded overview.md. Domain files are optional — agents create them for areas complex enough to warrant dedicated context.

**Progressive disclosure.** overview.md is a lightweight hub (~30-40 lines) that agents always load. patterns.md and domain files are detail files loaded on demand. This mirrors the HumanLayer/ATLAS approach: always-loaded file is small, topic-specific files hold the depth.

**SKILL.md drives restraint.** Explicit "STOP Rules" section prevents exhaustive documentation. Rule 9 enforces progressive disclosure: patterns belong in patterns.md, not inlined in overview.md. The biggest lever: agents naturally want to be thorough. The SKILL.md must actively prevent catalog-style output.

**ESM-only, TypeScript strict, Node >= 18.** No CommonJS, no loose types. The tsup build produces two bundles: library (`dist/index.js` with declarations) and CLI (`dist/bin/ctxify.js` with shebang).

## Key patterns

### CLI commands output JSON

Every command writes JSON to stdout. This makes output parseable by agents. Errors also output JSON with an `error` field, then `process.exit(1)`.

```typescript
console.log(JSON.stringify(result, null, 2));
```

### Interactive init (default)

When `ctxify init` is run without `--repos` or `--mono` flags and stdin is a TTY, it enters interactive mode using `@inquirer/prompts`: multi-select checkbox for agents (claude, copilot, cursor, codex), confirms detected workspace mode, and lets the user select repos. The interactive flow calls the same `scaffoldWorkspace()` function as the flag-driven path.

Flags (`--repos`, `--mono`, `--agent`) bypass interactivity for agent/CI use. Non-TTY stdin also falls through to the auto-detect path.

The skill installer (`src/cli/install-skill.ts`) reads all 7 files from `skills/` (SKILL.md + 6 satellite skills). Multi-file agents (claude, cursor) install each skill as a separate file with agent-specific frontmatter. Single-file agents (copilot, codex) concatenate all skills into one file. All installed files include a version comment header (`<!-- ctxify v... -->`). Version is read from package.json at runtime.

### Template generators are pure functions

Each template function takes typed data and returns a string. No side effects, no file I/O. The `init` command handles all file writing.

```typescript
export function generateRepoTemplate(repo: RepoTemplateData): string {
  return `# ${repo.name}\n...`;
}
```

### Segment markers for queryable content

HTML comments invisible to markdown renderers, parseable by `extractSegments()`:

```markdown
<!-- correction:2025-06-15T10:30:00.000Z -->
Auth middleware is not global — it's applied per-route.
<!-- /correction -->
```

Active tags: `domain-index`, `correction`, `antipattern`, `rule`, `question`. Attributes are colon-separated after the tag name.

### YAML frontmatter for structured metadata

Every `index.md` has YAML frontmatter between `---` delimiters for machine-readable metadata (mode, repos, timestamps). Repo overviews have frontmatter with `type: overview`, language, framework. Parseable with `parseFrontmatter()`.

### Manifest parsing fallback chain

`parseRepoManifest()` tries manifests in order: package.json → go.mod → pyproject.toml → requirements.txt. First found wins. Returns empty defaults if none found.

### Error hierarchy

All custom errors extend `CtxifyError` with optional `cause` for chaining:
- `ConfigError` — config parsing/validation failures
- `GitError` — git command failures

### Test isolation

Every test creates a temp directory in `beforeEach` and removes it in `afterEach`. No test depends on another. Integration tests invoke the built CLI binary with `execFileSync`.

## Shard format reference

After `ctxify init`, the `.ctxify/` directory contains:

```
.ctxify/
├── index.md                    # Workspace hub: overview, repo table, relationships, workflows
└── repos/
    └── {name}/
        ├── overview.md         # Repo hub (~30-40 lines): description, architecture, context file index
        ├── corrections.md      # Agent-logged factual corrections (always loaded)
        ├── rules.md            # Behavioral instructions and anti-patterns (always loaded)
        └── (agent creates after reading source:)
            ├── patterns.md     # How to build features — the primary deliverable
            └── {domain}.md     # Domain deep dives (one per complex area)
```

Progressive disclosure: overview.md is the table of contents (always loaded), patterns.md and domain files are the content (loaded on demand). The 7 focused skills in `skills/` guide this workflow (installed to agent-specific paths by `ctxify init --agent`): `SKILL.md` (orientation), `reading-context.md`, `filling-context.md`, `domain.md`, `corrections.md`, `rules.md`, `multi-repo.md`.

## Known gaps and future work

- `discoverEntryPoints` in manifest.ts re-reads package.json that the caller already parsed
- `validateShards` reads each file twice (once for segment markers, once for TODOs)
- No `ctxify update` / `ctxify refresh` command to re-scaffold without losing agent-filled content
- No support for Cargo.toml (Rust) manifest parsing — only framework detection via deps
- `git add -A` in `stageAndCommit` stages everything including potentially unrelated files

## README hygiene

Keep `README.md` in sync when making changes. The README is user-facing documentation — it must reflect current behaviour, not aspirational or stale state.

**Update README when:**
- Adding or removing a CLI command — update the Commands table
- Changing flags on an existing command — update the relevant row
- Changing how skills are installed (agent destinations, file count, format) — update the Supported agents table
- Adding a significant new workflow or feature — add or update the relevant section
- Changing the test count in Quick reference — update `npm test` line

**Do not** add sections for every internal refactor or test change. README covers user-visible behaviour only.

## Commit conventions

```
feat: imperative description of new feature
fix: imperative description of bug fix
docs: documentation changes
refactor: code reorganization without behavior change
chore: build, tooling, dependency changes
```

Lowercase, no period, imperative mood. Body optional. Reference task numbers in parentheses when relevant: `(Task 4)`.
