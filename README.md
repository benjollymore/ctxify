# ctxify

Context layer for AI coding agents — a turbocharged `CLAUDE.md` for multi-repo workspaces.

ctxify scaffolds workspace context that your agent fills with semantic analysis. It detects repos, generates markdown templates, and your agent does the thinking.

## How it works

1. **`ctxify init`** detects repos, parses manifests, scaffolds `.ctxify/` with markdown templates
2. **Your agent** reads source code and fills in semantic content (endpoints, types, relationships, etc.)
3. **`ctxify validate`** checks structural integrity of the filled shards

## Install

```bash
npm install -g ctxify
```

Or run directly:

```bash
npx ctxify init
```

## Commands

| Command | Purpose |
|---------|---------|
| `ctxify init` | Auto-detect repos, scaffold `.ctxify/` |
| `ctxify init --repos ./a ./b` | Multi-repo with explicit paths |
| `ctxify init --mono` | Monorepo (detect packages from workspace config) |
| `ctxify init --force` | Overwrite existing config and shards |
| `ctxify validate` | Check shard structural integrity |
| `ctxify status` | Report what's filled vs pending |
| `ctxify branch <name>` | Create branch across all repos |
| `ctxify commit <msg>` | Commit across repos with changes |

## Directory structure

```
workspace/
├── ctx.yaml                  # ctxify config
├── .ctxify/
│   ├── index.md              # Workspace overview (YAML frontmatter)
│   ├── _analysis.md          # Agent analysis checklist
│   ├── repos/
│   │   ├── api.md
│   │   └── web.md
│   ├── endpoints/
│   │   ├── api.md
│   │   └── web.md
│   ├── types/
│   │   └── shared.md
│   ├── env/
│   │   └── all.md
│   ├── topology/
│   │   └── graph.md
│   ├── schemas/
│   │   ├── api.md
│   │   └── web.md
│   └── questions/
│       └── pending.md
├── api/                      # Your repos as subdirectories
└── web/
```

## Shard format

Shards use YAML frontmatter for metadata and HTML comment segment markers (`<!-- tag:attrs -->...<!-- /tag -->`) for queryable content blocks.

## Constraints

All repos must be subdirectories of the workspace root. Run ctxify from the root.

## Development

```bash
npm run build        # build with tsup
npm run dev          # build in watch mode
npm test             # run vitest
npm run typecheck    # tsc --noEmit
```
