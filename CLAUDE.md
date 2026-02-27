# ctxify

Turbocharged workspace context for AI coding agents.

ctxify is a **scaffolder + validator**, not an analyzer. `ctxify init` detects repos, parses manifests (language, framework, deps, entry points), and scaffolds `.ctxify/` with CLAUDE.md-style markdown templates. The calling agent reads source code and fills in semantic content: architecture descriptions, coding patterns, domain knowledge, cross-repo relationships. `ctxify validate` checks structural integrity of the filled shards.

The key insight: mechanical extraction (parsing package.json, counting files, detecting frameworks) is deterministic and cheap. Semantic analysis (understanding architecture, patterns, and conventions) requires reading code — which agents already do well. ctxify handles the first part; agents handle the second. The output captures a senior engineer's mental model — not exhaustive catalogs of endpoints, schemas, or env vars.

## Quick reference

```
npm run build        # tsup → dist/index.js (library) + dist/bin/ctxify.js (CLI)
npm test             # vitest run — 151 tests, 17 files
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
src/cli/commands/*.ts            Command handlers (init, status, validate, branch, commit, domain, feedback)
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
| `validate.ts` | Check shard structural integrity: valid frontmatter, balanced segment markers, TODO detection. Exports `validateShards()`, `collectMdFiles()` |
| `detect.ts` | Auto-detect operating mode from workspace structure. Exports `autoDetectMode()` |
| `errors.ts` | Error hierarchy: `CtxifyError` → `ConfigError` / `GitError` |

### `src/cli/commands/` — CLI handlers

| File | Purpose |
|------|---------|
| `init.ts` | Interactive (default) or flag-driven scaffolder. Detects repos, parses manifests, generates index.md + repos/{name}/overview.md, optionally installs agent playbooks. Types: `AgentType` (`'claude' \| 'copilot' \| 'cursor' \| 'codex'`), `ScaffoldOptions` (with `agents?: AgentType[]`), `ScaffoldResult` (with `skills_installed?: string[]`). Flags: `--repos`, `--mono`, `--agent <agents...>`, `--force` |
| `init-interactive.ts` | Interactive prompt flow using @inquirer/prompts. Multi-select agent checkbox, confirms mode, confirms repos. Returns `ScaffoldOptions` |
| `status.ts` | JSON status report: index exists, repo list, shard dirs, TODO count |
| `validate.ts` | CLI wrapper for `validateShards()`. Exits 1 on failure |
| `branch.ts` | Create branch across all repos (multi-repo only) |
| `commit.ts` | Commit across all repos with changes (multi-repo only) |
| `clean.ts` | Remove .ctxify/ and ctx.yaml from workspace, respects custom outputDir |
| `domain.ts` | `domain add <repo> <domain>` scaffolds domain file + updates overview.md index. `domain list` scans for domain files. Flags: `--tags`, `--description`, `--repo` |
| `feedback.ts` | `feedback <repo> --body "..."` appends a correction entry to `repos/{name}/corrections.md`, creating the file if needed. JSON output with `status`, `created_file`, `timestamp` |

### `src/templates/` — markdown generators

Each file exports a pure function that takes mechanical data and returns a markdown string with YAML frontmatter, pre-filled mechanical sections, and `<!-- TODO: Agent — ... -->` placeholders for semantic content.

| File | Generates |
|------|-----------|
| `index-md.ts` | `.ctxify/index.md` — workspace overview with frontmatter, repo table, relationship/command TODOs |
| `repo.ts` | `.ctxify/repos/{name}/overview.md` — lightweight hub: curated dirs, essential scripts, context file index pointing to patterns.md + domain files. Exports `filterEssentialScripts()` |
| `domain.ts` | `.ctxify/repos/{name}/{domain}.md` — domain file template with frontmatter and TODO placeholders. Exports `generateDomainTemplate()` |
| `corrections.ts` | `.ctxify/repos/{name}/corrections.md` — corrections file template with frontmatter. Exports `generateCorrectionsTemplate()`, `formatCorrectionEntry()` |

### `src/utils/` — shared utilities

| File | Purpose |
|------|---------|
| `fs.ts` | `readFileIfExists()`, `readJsonFile()`, `isFile()`, `isDirectory()` |
| `git.ts` | `findGitRoots()` — synchronous git root discovery |
| `git-mutate.ts` | Write git: `createBranch()`, `hasChanges()`, `stageAndCommit()`, `getCurrentBranch()` |
| `yaml.ts` | `parseYaml()`, `dumpYaml()` — wrappers around js-yaml |
| `monorepo.ts` | `detectMonoRepo()` — pnpm/yarn/npm/turborepo workspace detection, package glob resolution |
| `frontmatter.ts` | `parseFrontmatter()` — extract YAML between `---` delimiters at file start |
| `segments.ts` | `extractSegments()` — extract content between `<!-- tag:attrs -->...<!-- /tag -->` markers, with optional attribute filtering |

### `src/cli/` — CLI utilities

| File | Purpose |
|------|---------|
| `install-skill.ts` | `AgentConfig` interface, `AGENT_CONFIGS` registry (claude, copilot, cursor, codex), `installSkill()` — reads `skills/PLAYBOOK.md`, prepends agent-specific frontmatter, writes to agent destination. `getPlaybookSourcePath()` resolves bundled playbook |

### `test/`

| File | What it tests |
|------|---------------|
| `unit/config.test.ts` | YAML parsing, validation, defaults, serialization roundtrip |
| `unit/manifest.test.ts` | Framework detection, entry points, key dirs, empty repos |
| `unit/templates.test.ts` | Index + repo template generators: frontmatter, curated dirs, essential scripts, filterEssentialScripts |
| `unit/validate.test.ts` | Frontmatter, segment markers, TODOs, TODO block stripping |
| `unit/query.test.ts` | Segment extraction and frontmatter parsing utilities |
| `unit/monorepo-detection.test.ts` | Workspace detection across package managers |
| `unit/git-mutate.test.ts` | Branch creation, change detection, commit |
| `unit/init-scaffold.test.ts` | scaffoldWorkspace function: single/multi-repo, skill install, gitignore |
| `unit/install-skill.test.ts` | Skill installer: copy, version header, directory creation, overwrite |
| `unit/init-interactive.test.ts` | resolveInteractiveOptions: mode mapping, agent pass-through |
| `unit/domain.test.ts` | Domain template generator, domain add (scaffold, idempotency, validation), domain list |
| `unit/feedback.test.ts` | Corrections template generator, feedback command (create, append, validation, unknown repo) |
| `unit/detect.test.ts` | Auto-detect mode: single-repo, multi-repo, mono-repo |
| `integration/init.test.ts` | Full init flow: single/multi/mono-repo scaffolding |
| `integration/git-commands.test.ts` | Multi-repo branch and commit coordination |
| `integration/status.test.ts` | Status without config, status after init |
| `integration/clean.test.ts` | Clean removes .ctxify/ + ctx.yaml, clean when nothing exists, clean with custom outputDir |

## Key patterns

### CLI commands output JSON

Every command writes JSON to stdout. This makes output parseable by agents. Errors also output JSON with an `error` field, then `process.exit(1)`.

```typescript
console.log(JSON.stringify(result, null, 2));
```

### Interactive init (default)

When `ctxify init` is run without `--repos` or `--mono` flags and stdin is a TTY, it enters interactive mode using `@inquirer/prompts`: multi-select checkbox for agents (claude, copilot, cursor, codex), confirms detected workspace mode, and lets the user select repos. The interactive flow calls the same `scaffoldWorkspace()` function as the flag-driven path.

Flags (`--repos`, `--mono`, `--agent`) bypass interactivity for agent/CI use. Non-TTY stdin also falls through to the auto-detect path.

The skill installer (`src/cli/install-skill.ts`) reads `skills/PLAYBOOK.md` (canonical playbook body, no frontmatter), prepends agent-specific frontmatter from `AGENT_CONFIGS`, inserts a version comment header (`<!-- ctxify v0.2.0 ... -->`), and writes to the agent's destination path. Version is read from package.json at runtime.

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

Tags: `endpoint`, `type`, `env`, `model`, `question`, `domain-index`, `correction`. Attributes are colon-separated after the tag name.

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

## Design decisions

These reflect deliberate choices. Don't reverse without understanding why they were made.

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

## Shard format reference

After `ctxify init`, the `.ctxify/` directory contains:

```
.ctxify/
├── index.md                    # Workspace hub: overview, repo table, relationships, workflows
└── repos/
    └── {name}/
        ├── overview.md         # Repo hub (~30-40 lines): description, architecture, commands, context file index
        ├── corrections.md      # Agent-logged corrections (created by ctxify feedback, always loaded)
        └── (agent creates after reading source:)
            ├── patterns.md     # How to build features — the primary deliverable
            └── {domain}.md     # Domain deep dives (one per complex area)
```

Progressive disclosure: overview.md is the table of contents (always loaded), patterns.md and domain files are the content (loaded on demand). The playbook at `skills/PLAYBOOK.md` guides this workflow (installed to agent-specific paths by `ctxify init --agent`).

## Current state

- **v0.3.1** — dead code removal, bug fixes, publish hygiene, new tests
- **v0.3.0** — domain registration (`ctxify domain add/list`), npm publish readiness
- **v0.2.0** — multi-agent support (claude, copilot, cursor, codex), interactive init with multi-select
- **Supported manifests**: package.json (JS/TS), go.mod (Go), pyproject.toml (Python), requirements.txt (Python fallback)
- **Supported modes**: single-repo, multi-repo, mono-repo (npm/yarn/pnpm/turborepo workspaces)
- **Supported agents**: Claude Code, GitHub Copilot, Cursor, OpenAI Codex — same playbook, different destination paths and frontmatter

## Known gaps and future work

- `discoverEntryPoints` in manifest.ts re-reads package.json that the caller already parsed
- `validateShards` reads each file twice (once for segment markers, once for TODOs)
- No `ctxify update` / `ctxify refresh` command to re-scaffold without losing agent-filled content
- No support for Cargo.toml (Rust) manifest parsing — only framework detection via deps
- `git add -A` in `stageAndCommit` stages everything including potentially unrelated files

## Commit conventions

```
feat: imperative description of new feature
fix: imperative description of bug fix
docs: documentation changes
refactor: code reorganization without behavior change
chore: build, tooling, dependency changes
```

Lowercase, no period, imperative mood. Body optional. Reference task numbers in parentheses when relevant: `(Task 4)`.
