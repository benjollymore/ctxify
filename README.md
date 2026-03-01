# ctxify

[![npm version](https://img.shields.io/npm/v/@benjollymore/ctxify)](https://www.npmjs.com/package/@benjollymore/ctxify)
[![tests](https://github.com/benjollymore/ctxify/actions/workflows/ci.yml/badge.svg)](https://github.com/benjollymore/ctxify/actions/workflows/ci.yml)
[![Node >=18](https://img.shields.io/node/v/@benjollymore/ctxify)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Persistent workspace knowledge for AI coding agents.

Every new agent session starts from scratch. The agent rediscovers your architecture, re-learns your patterns, and re-reads your conventions — every single time. You can write this down in CLAUDE.md or AGENTS.md, but a single flat file either stays too shallow to be useful or grows large enough to bloat every context window. ctxify fixes both problems: it scaffolds a structured knowledge layer (`.ctxify/`) that your agent fills with what it learns from reading your code, then uses progressive disclosure to load only what's relevant to the current task. The result is persistent context without the context window cost.

Works with single repos, monorepos, and multi-repo workspaces. Supports Claude Code, GitHub Copilot, Cursor, and OpenAI Codex.

## How it works

**ctxify scaffolds, your agent fills.** Mechanical extraction (parsing package.json, detecting frameworks) is deterministic and cheap — ctxify handles that. Semantic analysis (understanding architecture, patterns, conventions) requires reading code — your agent handles that.

1. **`ctxify init`** detects your repos, parses their manifests (package.json, go.mod, pyproject.toml, requirements.txt), and scaffolds `.ctxify/` with lightweight markdown templates pre-filled with mechanical data and TODO placeholders. It also installs agent skills that guide the filling process.

2. **Your agent** reads the scaffolded templates, explores your source code, and fills in the semantic content: architecture descriptions, coding patterns, domain knowledge, and (for multi-repo workspaces) cross-repo relationships. As the agent works, it continues to learn — adding domain files for complex areas it discovers and logging corrections when you tell it something was wrong or it discovers a mistake on its own.

3. **On every future session**, the agent loads the filled context and starts with a senior engineer's understanding of the codebase — not a blank slate. The installed skills use progressive disclosure to keep context window bloat in check: a lightweight overview is always loaded, but patterns and domain deep-dives are only pulled in when the agent is actually working in that area.

### Quick start

```bash
# Install globally
npm install -g @benjollymore/ctxify

# Or run directly with npx
npx @benjollymore/ctxify init
```

```bash
# Scaffold context in your workspace
cd your-workspace
ctxify init
```

After init, your agent loads the installed skills and takes it from there. For Claude Code, type `/ctxify`. Other agents (Copilot, Cursor, Codex) load the skills automatically via their native instruction mechanisms.

### Build from source

```bash
git clone https://github.com/benjollymore/ctxify.git
cd ctxify
npm install && npm run build
npm link
```

### Example workflow

```bash
workspace/
├── api/        # Express backend
└── web/        # React frontend

cd workspace
ctxify init --repos ./api ./web

# Your agent reads the scaffolded hubs and fills in context.
```

## What ctxify scaffolds

```
.ctxify/
├── index.md                    # Workspace hub: overview, repo table, relationships, workflows
└── repos/
    └── {name}/
        ├── overview.md         # Repo hub (~30-40 lines): architecture, context file index
        ├── corrections.md      # Agent-logged factual corrections (always loaded)
        ├── rules.md            # Behavioral instructions and anti-patterns (always loaded)
        └── (agent creates after reading source:)
            ├── patterns.md     # How to build features — the primary deliverable
            └── {domain}.md     # Domain deep dives (one per complex area)
```

**Progressive disclosure:** overview.md is a lightweight table of contents that agents always load. patterns.md and domain files hold the depth and are loaded on demand — only when the agent is working in that repo or domain.

## Commands

| Command | Purpose |
|---------|---------|
| `ctxify init` | Scaffold `.ctxify/`. Flags: `--repos <paths...>`, `--mono`, `--agent <agents...>`, `--force`, `--hook`/`--no-hook` |
| `ctxify status` | Report what's filled vs pending |
| `ctxify validate` | Check shard structural integrity |
| `ctxify audit` | Quality analysis of context shards: token budget, unfilled TODOs, prose walls, size issues. Flags: `--repo <name>` |
| `ctxify patterns <repo>` | Scaffold `patterns.md` with TODO placeholders for an agent to fill. Flags: `--force` |
| `ctxify domain add <repo> <domain>` | Scaffold a domain file with TODO placeholders + update overview.md index. Flags: `--tags`, `--description` |
| `ctxify domain list` | List registered domain files. Flags: `--repo` |
| `ctxify feedback <repo>` | Log feedback. Corrections go to `corrections.md`, rules and anti-patterns go to `rules.md`. Flags: `--body` (required), `--type correction\|rule\|antipattern`, `--source file:line` |
| `ctxify upgrade` | Upgrade ctxify and reinstall all tracked agent skills |
| `ctxify clean` | Remove `.ctxify/` and `ctx.yaml` |
| `ctxify branch <name>` | Create a branch across all repos (multi-repo only) |
| `ctxify commit <msg>` | Commit across all repos with changes (multi-repo only) |

All commands output JSON to stdout.

## Supported agents

`ctxify init` installs 7 focused skills that teach your agent the progressive disclosure workflow. Select agents interactively or via `--agent`:

| Agent | Flag | Primary skill | Files installed |
|-------|------|---------------|-----------------|
| Claude Code | `--agent claude` | `.claude/skills/ctxify/SKILL.md` | 7 separate skill files |
| GitHub Copilot | `--agent copilot` | `.github/instructions/ctxify.instructions.md` | 1 combined file |
| Cursor | `--agent cursor` | `.cursor/rules/ctxify.md` | 7 separate rule files |
| OpenAI Codex | `--agent codex` | `AGENTS.md` | 1 combined file |

**Skill scope:** During `ctxify init`, you'll be prompted to choose where to install skills for each agent that supports global installation (Claude Code and Codex). Choose **workspace** (default) to install skills local to the current project, or **global** to install to your home directory (e.g., `~/.claude/skills/`) so skills are available in every project.

Multiple agents: `ctxify init --agent claude copilot cursor`

The 7 skills are: `ctxify` (loads context before coding — the main entry point), `ctxify:startup` (troubleshooting), `ctxify:reading-context` (detailed loading reference), `ctxify:filling-context`, `ctxify:domain`, `ctxify:corrections`, `ctxify:rules`, `ctxify:multi-repo`. Each has a focused trigger description so agents self-activate at the right moment — without being prompted.

**Sub-agent delegation (Claude Code):** The `ctxify:filling-context` skill delegates per-repo context filling (passes 1-3) to Haiku sub-agents — cheaper, faster, and parallel. Pass 4 (cross-repo index.md) stays with the orchestrator. Other agents fall back to sequential execution automatically.

### Claude Code session hook

When you select Claude Code as an agent, `ctxify init` installs a [SessionStart hook](https://docs.anthropic.com/en/docs/claude-code/hooks) in `.claude/settings.json` that runs `ctxify context-hook` every time a Claude Code session starts, resumes, or compacts. The hook:

1. Outputs a compact summary of available context (which repos have corrections/rules and how many) — without injecting full file content into the context window
2. Nudges the agent to invoke `/ctxify` to detect context state and load appropriately

This gives agents awareness that corrections and rules exist — and a nudge to load them via `/ctxify` — without polluting the context window with full content. Use `--no-hook` to skip hook installation if you prefer to manage context loading manually.

The hook is reinstalled on `ctxify upgrade` and removed on `ctxify clean`.

## Agent integration

When you run `ctxify init`, the installed skills teach your agent how to:

1. Read the scaffolded hubs (index.md + overview.md per repo)
2. Run `ctxify patterns <repo>` to scaffold `patterns.md`, then fill the TODOs — the most important deliverable
3. Run `ctxify domain add <repo> <domain>` to scaffold domain files for complex areas
4. Fill cross-repo workflows in index.md
5. Log corrections with `ctxify feedback <repo> --type correction` when context guidance was wrong
6. Log behavioral rules with `ctxify feedback <repo> --type rule` when you correct the agent's approach

## Keeping ctxify and skills up to date

```bash
ctxify upgrade
```

Upgrades ctxify using the install method recorded in `ctx.yaml` at init time (global npm, local npm, or npx), then reinstalls all agent skills that were originally installed. Run it from your workspace root.

```bash
ctxify upgrade --dry-run   # show what would happen without executing
```

The install method and installed agents are persisted in `ctx.yaml` automatically on `ctxify init`, so `upgrade` requires no flags.

To suppress the update warning in CI or scripts, set `CI=true` (standard in GitHub Actions, CircleCI, etc.) or `CTXIFY_NO_UPDATE_CHECK=1`.

## Supported manifests and modes

**Manifests** (parsed in order, first found wins): package.json, go.mod, pyproject.toml, requirements.txt

**Modes**: single-repo, multi-repo (multiple repositories in shared directory with `ctxify` run from root directory), mono-repo (npm/yarn/pnpm/turborepo workspaces)

## Development

Requires Node >= 18. ESM-only.

```bash
npm run build        # tsup → dist/index.js (library) + dist/bin/ctxify.js (CLI)
npm run dev          # tsup --watch
npm test             # vitest run
npm run typecheck    # tsc --noEmit
```

## License

MIT
