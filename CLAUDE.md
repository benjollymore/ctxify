# ctxify

Context layer for AI coding agents. A turbocharged CLAUDE.md for multi-repo workspaces.

ctxify is a **scaffolder + validator**, not an analyzer. `ctxify init` detects repos, parses manifests (language, framework, deps, entry points), and scaffolds `.ctxify/` with markdown templates. The calling agent reads source code and fills in semantic content: endpoint documentation, shared types, environment variables, relationships, database schemas, conventions. `ctxify validate` checks structural integrity of the filled shards.

The key insight: mechanical extraction (parsing package.json, counting files, detecting frameworks) is deterministic and cheap. Semantic analysis (understanding what an API does, how repos relate, what conventions exist) requires reading code — which agents already do well. ctxify handles the first part; agents handle the second.

## Quick reference

```
npm run build        # tsup → dist/index.js (library) + dist/bin/ctxify.js (CLI)
npm test             # vitest run — 107 tests, 10 files
npm run typecheck    # tsc --noEmit (strict mode)
npm run dev          # tsup --watch
```

Run a specific test file:
```
npx vitest run test/unit/validate.test.ts
```

## Architecture

```
bin/ctxify.ts                    CLI entry (Commander.js, registers commands)
    ↓
src/cli/commands/*.ts            Command handlers (init, status, validate, branch, commit)
    ↓
src/core/*.ts                    Business logic (config, manifest, validate, detect)
src/templates/*.ts               Markdown template generators
    ↓
src/utils/*.ts                   Shared utilities (fs, git, yaml, frontmatter, segments)
```

The library is also exported from `src/index.ts` for programmatic use (config, manifest, validate, detect, frontmatter, segments).

## Source map

### `src/core/` — business logic

| File | Purpose |
|------|---------|
| `config.ts` | Load/validate/serialize `ctx.yaml`. Types: `CtxConfig`, `OperatingMode` (`single-repo` / `multi-repo` / `mono-repo`), `RepoEntry` |
| `manifest.ts` | Parse repo manifests (package.json → go.mod → pyproject.toml → requirements.txt). Extract language, framework, deps, entry points, key dirs, file count. Exports `ManifestData`, `parseRepoManifest()` |
| `validate.ts` | Check shard structural integrity: valid frontmatter, balanced segment markers, TODO detection, totals consistency. Exports `validateShards()`, `collectMdFiles()` |
| `detect.ts` | Auto-detect operating mode from workspace structure. Exports `autoDetectMode()` |
| `context.ts` | Type definitions for semantic data (ApiEndpoint, SharedType, EnvVar, etc.). Reference documentation — agents write this data directly to markdown, not through code |
| `errors.ts` | Error hierarchy: `CtxifyError` → `ConfigError` / `GitError` |

### `src/cli/commands/` — CLI handlers

| File | Purpose |
|------|---------|
| `init.ts` | Interactive (default) or flag-driven scaffolder. Detects repos, parses manifests, generates all templates, writes `.ctxify/`, optionally installs agent skill. Flags: `--repos`, `--mono`, `--force` |
| `init-interactive.ts` | Interactive prompt flow using @inquirer/prompts. Asks agent type, confirms mode, confirms repos. Returns `ScaffoldOptions` |
| `status.ts` | JSON status report: index exists, repo list, shard dirs, TODO count |
| `validate.ts` | CLI wrapper for `validateShards()`. Exits 1 on failure |
| `branch.ts` | Create branch across all repos (multi-repo only) |
| `commit.ts` | Commit across all repos with changes (multi-repo only) |

### `src/templates/` — markdown generators

Each file exports a pure function that takes mechanical data and returns a markdown string with YAML frontmatter, pre-filled mechanical sections, and `<!-- TODO: Agent — ... -->` placeholders for semantic content.

| File | Generates |
|------|-----------|
| `index-md.ts` | `.ctxify/index.md` — workspace overview with frontmatter, repo table, shard links |
| `repo.ts` | `.ctxify/repos/{name}.md` — entry points, structure, deps, scripts |
| `endpoints.ts` | `.ctxify/endpoints/{name}.md` — TODO with segment marker examples |
| `types.ts` | `.ctxify/types/shared.md` — heading adapts to mode (Shared vs Exported) |
| `env.ts` | `.ctxify/env/all.md` — env var documentation template |
| `topology.ts` | `.ctxify/topology/graph.md` — pre-filled repo list, relationships TODO |
| `schemas.ts` | `.ctxify/schemas/{name}.md` — database schema template |
| `questions.ts` | `.ctxify/questions/pending.md` — unresolved questions template |
| `analysis.ts` | `.ctxify/_analysis.md` — per-repo checklist for agent analysis |

### `src/utils/` — shared utilities

| File | Purpose |
|------|---------|
| `fs.ts` | `readFileIfExists()`, `readJsonFile()`, `isFile()`, `isDirectory()`, `findFiles()`, `listDirs()` |
| `git.ts` | Read-only git: `isGitRepo()`, `getHeadSha()`, `getDiff()`, `getTrackedFiles()`, `findGitRoots()` |
| `git-mutate.ts` | Write git: `createBranch()`, `hasChanges()`, `stageAndCommit()`, `getCurrentBranch()` |
| `yaml.ts` | `parseYaml()`, `dumpYaml()` — wrappers around js-yaml |
| `monorepo.ts` | `detectMonoRepo()` — pnpm/yarn/npm/turborepo workspace detection, package glob resolution |
| `frontmatter.ts` | `parseFrontmatter()` — extract YAML between `---` delimiters at file start |
| `segments.ts` | `extractSegments()` — extract content between `<!-- tag:attrs -->...<!-- /tag -->` markers, with optional attribute filtering |

### `src/cli/` — CLI utilities

| File | Purpose |
|------|---------|
| `install-skill.ts` | `installSkill()` — copies SKILL.md with version header to target workspace agent skill directory. `getSkillSourcePath()` resolves bundled SKILL.md |

### `test/`

| File | What it tests |
|------|---------------|
| `unit/config.test.ts` | YAML parsing, validation, defaults, serialization roundtrip |
| `unit/manifest.test.ts` | Framework detection, entry points, key dirs, empty repos |
| `unit/templates.test.ts` | All 9 template generators: frontmatter, content, shard links |
| `unit/validate.test.ts` | Frontmatter, segment markers, TODOs, totals, TODO block stripping |
| `unit/query.test.ts` | Segment extraction and frontmatter parsing utilities |
| `unit/context.test.ts` | Type shape validation for all context interfaces |
| `unit/monorepo-detection.test.ts` | Workspace detection across package managers |
| `unit/git-mutate.test.ts` | Branch creation, change detection, commit |
| `unit/init-scaffold.test.ts` | scaffoldWorkspace function: single/multi-repo, skill install, gitignore |
| `unit/install-skill.test.ts` | Skill installer: copy, version header, directory creation, overwrite |
| `unit/init-interactive.test.ts` | resolveInteractiveOptions: mode mapping, agent pass-through |
| `integration/init.test.ts` | Full init flow: single/multi/mono-repo scaffolding |
| `integration/git-commands.test.ts` | Multi-repo branch and commit coordination |

## Key patterns

### CLI commands output JSON

Every command writes JSON to stdout. This makes output parseable by agents. Errors also output JSON with an `error` field, then `process.exit(1)`.

```typescript
console.log(JSON.stringify(result, null, 2));
```

### Interactive init (default)

When `ctxify init` is run without `--repos` or `--mono` flags and stdin is a TTY, it enters interactive mode using `@inquirer/prompts`: asks for agent type (Claude Code), confirms detected workspace mode, and lets the user select repos. The interactive flow calls the same `scaffoldWorkspace()` function as the flag-driven path.

Flags (`--repos`, `--mono`) bypass interactivity for agent/CI use. Non-TTY stdin also falls through to the auto-detect path.

The skill installer (`src/cli/install-skill.ts`) copies `.claude/skills/ctxify/SKILL.md` with a version comment header (`<!-- ctxify v0.1.0 ... -->`) to the target workspace. Version is read from package.json at runtime.

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
<!-- endpoint:GET:/users -->
**GET /users** — `src/routes/users.ts:5` (getUsers)
<!-- /endpoint -->
```

Tags: `endpoint`, `type`, `env`, `model`, `question`. Attributes are colon-separated after the tag name.

### YAML frontmatter for structured metadata

Every `index.md` has YAML frontmatter between `---` delimiters for machine-readable metadata (mode, totals, timestamps). Parseable with `parseFrontmatter()`.

### Manifest parsing fallback chain

`parseRepoManifest()` tries manifests in order: package.json → go.mod → pyproject.toml → requirements.txt. First found wins. Returns empty defaults if none found.

### Error hierarchy

All custom errors extend `CtxifyError` with optional `cause` for chaining:
- `ConfigError` — config parsing/validation failures
- `GitError` — git command failures

### Test isolation

Every test creates a temp directory in `beforeEach` and removes it in `afterEach`. No test depends on another. Integration tests invoke the built CLI binary with `execFileSync`.

## Design decisions

These reflect deliberate choices. Don't reverse without understanding why they were made.

**Agent-native architecture.** ctxify scaffolds templates; agents fill semantic content. No regex-based analysis passes. The previous architecture (v1) used 8 regex passes to extract endpoints, types, env vars, etc. The output was machine-shaped data that agents had to parse. v2 flips this: output is markdown that agents read naturally, and agents do the analysis directly on source code.

**Markdown with YAML frontmatter.** Shards are `.md` files, not `.yaml` or `.json`. Agents understand prose better than structured data. YAML frontmatter gives structured metadata where needed (totals, mode, timestamps) without sacrificing readability.

**HTML comment segment markers.** `<!-- tag:attrs -->...<!-- /tag -->` enables targeted extraction without reading entire files. Invisible to markdown renderers. Proven to work well as LLM context optimization — agents can request specific segments instead of consuming entire shards.

**Interactive by default, flags for agents.** `ctxify init` is interactive when run from a TTY (prompts for agent, mode, repos). Flags (`--repos`, `--mono`) bypass interactivity for agent/CI use. Both paths call the same `scaffoldWorkspace()` function.

**All repos must be subdirectories of workspace root.** This constraint simplifies path resolution and makes the mental model clear. ctxify always runs from the root.

**Progressive disclosure.** `index.md` gives enough to plan. Repo shards give enough to understand a repo. Detail shards (endpoints, types) give enough to implement. Each level points to the next.

**ESM-only, TypeScript strict, Node >= 18.** No CommonJS, no loose types. The tsup build produces two bundles: library (`dist/index.js` with declarations) and CLI (`dist/bin/ctxify.js` with shebang).

## Shard format reference

After `ctxify init`, the `.ctxify/` directory contains:

```
.ctxify/
├── index.md              # Workspace overview (YAML frontmatter + repo table + shard links)
├── _analysis.md          # Agent analysis checklist (generated, specific to workspace)
├── repos/{name}.md       # Per-repo: entry points, structure, deps, scripts, conventions
├── endpoints/{name}.md   # Per-repo: API endpoint documentation
├── types/shared.md       # Cross-repo shared types (or exported types for single-repo)
├── env/all.md            # Environment variable documentation
├── topology/graph.md     # How repos connect at runtime
├── schemas/{name}.md     # Database schema documentation
└── questions/pending.md  # Unresolved questions from analysis
```

The SKILL file at `.claude/skills/ctxify/SKILL.md` is the agent playbook for working with these shards.

## Current state

- **v0.1.0** — agent-native architecture, interactive init with skill installation
- **126 tests** across 13 files (11 unit, 2 integration)
- **Supported manifests**: package.json (JS/TS), go.mod (Go), pyproject.toml (Python), requirements.txt (Python fallback)
- **Supported modes**: single-repo, multi-repo, mono-repo (npm/yarn/pnpm/turborepo workspaces)
- **Target agent**: Claude Code (via SKILL.md playbook). Other agents not yet supported but the markdown output is agent-agnostic

## Known gaps and future work

- No integration tests for `status` and `validate` CLI commands (unit tests exist for the core logic)
- `discoverEntryPoints` in manifest.ts re-reads package.json that the caller already parsed
- `validateShards` reads each file twice (once for segment markers, once for TODOs)
- Index frontmatter stores absolute workspace path — not portable across machines
- No `ctxify update` / `ctxify refresh` command to re-scaffold without losing agent-filled content
- No support for Cargo.toml (Rust) manifest parsing — only framework detection via deps
- `git add -A` in `stageAndCommit` stages everything including potentially unrelated files
- No way for agents other than Claude Code to discover the SKILL.md playbook

## Commit conventions

```
feat: imperative description of new feature
fix: imperative description of bug fix
docs: documentation changes
refactor: code reorganization without behavior change
chore: build, tooling, dependency changes
```

Lowercase, no period, imperative mood. Body optional. Reference task numbers in parentheses when relevant: `(Task 4)`.
