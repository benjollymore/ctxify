# ctxify

Context layer for AI coding agents — a turbocharged `CLAUDE.md` for multi-repo workspaces.

AI agents struggle with multi-repo projects. They can see one repo at a time but miss the bigger picture: which services call which, what types are shared, how patterns differ across repos. ctxify scaffolds a structured context layer (`.ctxify/`) that your agent fills with semantic analysis from reading source code. The result is a persistent knowledge base that any agent session can read to understand the whole workspace.

## How it works

Two roles: **ctxify scaffolds**, **your agent fills**.

1. **`ctxify init`** detects your repos, parses their manifests (package.json, go.mod, pyproject.toml, requirements.txt), and scaffolds `.ctxify/` with lightweight markdown hubs pre-filled with mechanical data and TODO placeholders.

2. **Your agent** reads the hubs, explores source code, and creates detail files — `patterns.md` (how to build features) and domain files (deep dives into complex areas).

3. **`ctxify validate`** checks structural integrity: valid frontmatter, balanced segment markers, TODO detection.

### Quick start

```bash
# Install globally
npm install -g ctxify

# Or run directly
npx ctxify init
```

```bash
# Scaffold context in your workspace
cd your-workspace
ctxify init
```

After init, open Claude Code in the workspace and type `/ctxify`. The skill guides the agent through reading your code and filling in architecture, patterns, and domain knowledge.

### Example workflow

```bash
workspace/
├── api/        # Express backend
└── web/        # React frontend

cd workspace
ctxify init --repos ./api ./web

# Now open Claude Code in this workspace and run:
#   /ctxify
# The agent will read your code and fill .ctxify/ with context.
```

## What ctxify scaffolds

```
.ctxify/
├── index.md                    # Workspace hub: overview, repo table, relationships, workflows
└── repos/
    └── {name}/
        ├── overview.md         # Repo hub (~30-40 lines): architecture, commands, context file index
        └── (agent creates after reading source:)
            ├── patterns.md     # How to build features — the primary deliverable
            └── {domain}.md     # Domain deep dives (one per complex area)
```

**Progressive disclosure:** overview.md is a lightweight table of contents that agents always load. patterns.md and domain files hold the depth and are loaded on demand — only when the agent is working in that repo or domain.

## Commands

| Command | Purpose |
|---------|---------|
| `ctxify init` | Scaffold `.ctxify/`. Flags: `--repos <paths...>`, `--mono`, `--agent <agents...>`, `--force` |
| `ctxify status` | Report what's filled vs pending |
| `ctxify validate` | Check shard structural integrity |
| `ctxify domain add <repo> <domain>` | Scaffold a domain file with TODO placeholders + update overview.md index. Flags: `--tags`, `--description` |
| `ctxify domain list` | List registered domain files. Flags: `--repo` |
| `ctxify clean` | Remove `.ctxify/` and `ctx.yaml` |
| `ctxify branch <name>` | Create a branch across all repos (multi-repo only) |
| `ctxify commit <msg>` | Commit across all repos with changes (multi-repo only) |

All commands output JSON to stdout.

## Supported agents

`ctxify init` installs a playbook that teaches your agent the progressive disclosure workflow. Select agents interactively or via `--agent`:

| Agent | Flag | Destination |
|-------|------|-------------|
| Claude Code | `--agent claude` | `.claude/skills/ctxify/SKILL.md` |
| GitHub Copilot | `--agent copilot` | `.github/instructions/ctxify.instructions.md` |
| Cursor | `--agent cursor` | `.cursor/rules/ctxify.md` |
| OpenAI Codex | `--agent codex` | `AGENTS.md` |

Multiple agents: `ctxify init --agent claude copilot cursor`

The playbook content is identical across agents — only the destination path and frontmatter format differ.

## Agent integration

When you run `ctxify init`, the installed playbook teaches your agent how to:

1. Read the scaffolded hubs (index.md + overview.md per repo)
2. Create `patterns.md` for each repo — the most important deliverable
3. Create domain files for complex areas
4. Fill cross-repo workflows in index.md

For Claude Code: after init, type `/ctxify` and the agent takes it from there. Other agents load the playbook automatically via their native instruction mechanisms.

## Supported manifests and modes

**Manifests** (parsed in order, first found wins): package.json, go.mod, pyproject.toml, requirements.txt

**Modes**: single-repo, multi-repo, mono-repo (npm/yarn/pnpm/turborepo workspaces)

## Development

Requires Node >= 18. ESM-only.

```bash
git clone https://github.com/benjollymore/ctxify.git
cd ctxify
npm install && npm run build
```

```bash
npm run build        # tsup → dist/index.js (library) + dist/bin/ctxify.js (CLI)
npm run dev          # tsup --watch
npm test             # vitest run
npm run typecheck    # tsc --noEmit
```

## License

MIT
