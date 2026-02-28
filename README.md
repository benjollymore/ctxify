# ctxify

[![npm version](https://img.shields.io/npm/v/@benjollymore/ctxify)](https://www.npmjs.com/package/@benjollymore/ctxify)
[![Tests](https://github.com/benjollymore/ctxify/actions/workflows/ci.yml/badge.svg)](https://github.com/benjollymore/ctxify/actions/workflows/ci.yml)
[![Node >=18](https://img.shields.io/node/v/@benjollymore/ctxify)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Context layer for AI coding agents — a turbocharged context framework for single, mono, and multi-repo workspaces.

AI agents struggle with multi-repo projects. They can see one repo at a time but miss the bigger picture: which services call which, what types are shared, how patterns differ across repos. ctxify scaffolds a structured context layer (`.ctxify/`) that your agent fills with semantic analysis from reading source code. The result is a persistent workspace context framework that any agent session can read to understand the big workspace and evolves with time. 

## How it works

Two roles: **ctxify scaffolds**, **your agent fills**.

1. **`ctxify init`** detects your repos, parses their manifests (package.json, go.mod, pyproject.toml, requirements.txt), and scaffolds `.ctxify/` with lightweight markdown hubs pre-filled with mechanical data and TODO placeholders.

2. **Your agent** reads the hubs, explores source code, and creates detail files — `patterns.md` (how to build features) and domain files (deep dives into complex areas).

3. **`ctxify validate`** checks structural integrity: valid frontmatter, balanced segment markers, TODO detection.

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
        ├── overview.md         # Repo hub (~30-40 lines): architecture, commands, context file index
        ├── corrections.md      # Agent-logged corrections (created by ctxify feedback, always loaded)
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
| `ctxify patterns <repo>` | Scaffold `patterns.md` with TODO placeholders for an agent to fill. Flags: `--force` |
| `ctxify domain add <repo> <domain>` | Scaffold a domain file with TODO placeholders + update overview.md index. Flags: `--tags`, `--description` |
| `ctxify domain list` | List registered domain files. Flags: `--repo` |
| `ctxify feedback <repo>` | Log a correction or anti-pattern to `corrections.md`. Flags: `--body` (required), `--type correction\|antipattern`, `--source file:line` |
| `ctxify upgrade` | Upgrade ctxify and reinstall all tracked agent skills |
| `ctxify clean` | Remove `.ctxify/` and `ctx.yaml` |
| `ctxify branch <name>` | Create a branch across all repos (multi-repo only) |
| `ctxify commit <msg>` | Commit across all repos with changes (multi-repo only) |

All commands output JSON to stdout.

## Supported agents

`ctxify init` installs 6 focused skills that teach your agent the progressive disclosure workflow. Select agents interactively or via `--agent`:

| Agent | Flag | Primary skill | Files installed |
|-------|------|---------------|-----------------|
| Claude Code | `--agent claude` | `.claude/skills/ctxify/SKILL.md` | 6 separate skill files |
| GitHub Copilot | `--agent copilot` | `.github/instructions/ctxify.instructions.md` | 1 combined file |
| Cursor | `--agent cursor` | `.cursor/rules/ctxify.md` | 6 separate rule files |
| OpenAI Codex | `--agent codex` | `AGENTS.md` | 1 combined file |

**Skill scope:** During `ctxify init`, you'll be prompted to choose where to install skills for each agent that supports global installation (Claude Code and Codex). Choose **workspace** (default) to install skills local to the current project, or **global** to install to your home directory (e.g., `~/.claude/skills/`) so skills are available in every project.

Multiple agents: `ctxify init --agent claude copilot cursor`

The 6 skills are: `ctxify` (orientation), `ctxify:reading-context`, `ctxify:filling-context`, `ctxify:domain`, `ctxify:corrections`, `ctxify:multi-repo`. Each has a focused trigger description so agents self-activate at the right moment — without being prompted.

### Claude Code session hook

When you select Claude Code as an agent, `ctxify init` installs a [SessionStart hook](https://docs.anthropic.com/en/docs/claude-code/hooks) in `.claude/settings.json` that runs `ctxify context-hook` every time a Claude Code session starts, resumes, or compacts. The hook:

1. Outputs any `corrections.md` content from `.ctxify/repos/*/` — so past corrections are always in context
2. Nudges the agent to invoke `/ctxify-reading-context` for full patterns and domain context

This means corrections are automatically loaded without the agent needing to remember to check. Use `--no-hook` to skip hook installation if you prefer to manage context loading manually.

The hook is reinstalled on `ctxify upgrade` and removed on `ctxify clean`.

## Agent integration

When you run `ctxify init`, the installed skills teach your agent how to:

1. Read the scaffolded hubs (index.md + overview.md per repo)
2. Run `ctxify patterns <repo>` to scaffold `patterns.md`, then fill the TODOs — the most important deliverable
3. Run `ctxify domain add <repo> <domain>` to scaffold domain files for complex areas
4. Fill cross-repo workflows in index.md
5. Log corrections with `ctxify feedback <repo>` when context guidance was wrong

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
