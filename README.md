# ctxify

Context layer for AI coding agents — a turbocharged `CLAUDE.md` for multi-repo workspaces.

AI agents struggle with multi-repo projects. They can see one repo at a time but miss the bigger picture: which services call which, what types are shared, how environment variables flow across boundaries. ctxify scaffolds a structured context layer (`.ctxify/`) that your agent fills with semantic analysis from reading source code. The result is a queryable knowledge base that any agent session can read to understand the whole workspace.

## The problem

When an AI agent works in a multi-repo workspace, it faces a cold-start problem on every session. It doesn't know which repos exist, how they connect, what APIs they expose, or what types they share. Without explicit context, it guesses — and gets things wrong.

ctxify solves this by separating mechanical extraction (parsing manifests, detecting frameworks, counting files) from semantic analysis (understanding what an API does, how repos relate). ctxify handles the mechanical part; your agent handles the semantic part by reading the actual source code.

## How it works

Three steps: **scaffold**, **fill**, **validate**.

1. **`ctxify init`** detects your repos, parses their manifests (package.json, go.mod, pyproject.toml, requirements.txt), and scaffolds `.ctxify/` with markdown templates pre-filled with mechanical data and TODO placeholders for semantic content.

2. **Your agent** reads the analysis checklist (`.ctxify/_analysis.md`), walks through source code, and fills each shard with structured documentation — endpoints, shared types, environment variables, relationships, and anything else it discovers.

3. **`ctxify validate`** checks structural integrity: valid frontmatter, balanced segment markers, TODO detection, and totals consistency.

### Example workflow

```bash
# You have a workspace with two repos
workspace/
├── api/        # Express backend
└── web/        # React frontend

# Scaffold context
cd workspace
ctxify init --repos ./api ./web

# Agent fills shards by reading source code...
# (this happens in your agent session — see Agent Integration below)

# Validate the result
ctxify validate
```

After the agent fills the shards, any future agent session can read `.ctxify/index.md` to understand the entire workspace without re-analyzing everything.

## Getting started

ctxify is not published to npm. To use it, clone and build from source:

```bash
git clone <repo-url> ctxify
cd ctxify
npm install
npm run build
```

Then either link it globally or run the built binary directly:

```bash
# Option A: link globally
npm link
ctxify init

# Option B: run the binary directly
node dist/bin/ctxify.js init
```

### First use

1. Arrange your repos as subdirectories of a workspace root.
2. Run `ctxify init` from the workspace root (see Commands for mode flags).
3. Open a Claude Code session in the workspace. The SKILL.md playbook guides the agent through `.ctxify/_analysis.md` to fill each shard.
4. Run `ctxify validate` to check structural integrity.

## Commands

| Command | Purpose |
|---------|---------|
| `ctxify init` | Auto-detect repos, scaffold `.ctxify/`. Flags: `--repos <paths...>` (explicit repo paths), `--mono` (monorepo mode), `--force` (overwrite existing) |
| `ctxify status` | Report what's filled vs pending. Flag: `--dir <path>` |
| `ctxify validate` | Check shard structural integrity. Flag: `--dir <path>` |
| `ctxify branch <name>` | Create a branch across all repos (multi-repo only). Flag: `--dir <path>` |
| `ctxify commit <msg>` | Commit across all repos with changes. Flag: `--dir <path>` |

All commands output JSON to stdout, making them parseable by agents.

## What ctxify scaffolds

```
.ctxify/
├── index.md              # Workspace overview with YAML frontmatter, repo table, shard links
├── _analysis.md          # Per-repo analysis checklist for the agent to follow
├── repos/
│   └── {name}.md         # Per-repo detail: entry points, structure, deps, scripts
├── endpoints/
│   └── {name}.md         # API endpoint documentation (one per repo)
├── types/
│   └── shared.md         # Cross-repo shared types (or exported types in single-repo mode)
├── env/
│   └── all.md            # Environment variable documentation
├── topology/
│   └── graph.md          # How repos connect at runtime (API calls, shared DB, events)
├── schemas/
│   └── {name}.md         # Database schema documentation (one per repo)
└── questions/
    └── pending.md        # Unresolved questions from analysis
```

A `ctx.yaml` config file is also created at the workspace root.

## Shard format

Shards are markdown files with two structural features:

**YAML frontmatter** — structured metadata between `---` delimiters at the top of `index.md`. Contains mode, totals (repos, endpoints, shared_types, env_vars), and timestamps.

**Segment markers** — HTML comments that delimit queryable content blocks. Tags: `endpoint`, `type`, `env`, `model`, `question`. Attributes are colon-separated after the tag name.

Here's what a filled endpoint shard looks like:

```markdown
# api — Endpoints

<!-- endpoint:GET:/users -->
**GET /users** — `src/routes/users.ts:14` (listUsers)
Returns paginated list of users. Requires auth token.
<!-- /endpoint -->

<!-- endpoint:POST:/users -->
**POST /users** — `src/routes/users.ts:42` (createUser)
Creates a new user. Validates email uniqueness.
<!-- /endpoint -->
```

The segment markers are invisible to markdown renderers but parseable by `extractSegments()` for targeted reads — agents can request specific segments instead of consuming entire files.

## Agent integration

ctxify is designed for use with **Claude Code**. The agent playbook lives at `.claude/skills/ctxify/SKILL.md` and guides Claude through:

1. Detecting whether a ctxify workspace exists
2. Running `ctxify init` if needed
3. Reading context with progressive disclosure (index first, then specific shards)
4. Filling each shard type with the correct format
5. Updating frontmatter totals and running validation

The analysis checklist (`.ctxify/_analysis.md`) is generated per-workspace and gives the agent a concrete, repo-specific task list.

The markdown output is agent-agnostic — any agent that reads markdown can consume the shards — but the SKILL.md playbook is currently tailored for Claude Code.

## Constraints

All repos must be subdirectories of the workspace root. ctxify always runs from the root and all paths are resolved relative to it. This is a usage requirement — the code does not enforce it, but the scaffolded context will be incorrect if repos live elsewhere.

## Supported manifests and modes

**Manifests** (parsed in order, first found wins): package.json, go.mod, pyproject.toml, requirements.txt

**Modes**: single-repo, multi-repo, mono-repo (npm/yarn/pnpm/turborepo workspaces)

## Development

Requires Node >= 18. ESM-only.

```bash
npm run build           # tsup → dist/index.js (library) + dist/bin/ctxify.js (CLI)
npm run dev             # tsup --watch
npm test                # vitest run
npm run test:watch      # vitest in watch mode
npm run typecheck       # tsc --noEmit
npm run lint            # tsc --noEmit
npm run prepublishOnly  # npm run build
```

**Dependencies**: commander, glob, js-yaml

## License

MIT
