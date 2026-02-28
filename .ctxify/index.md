---
ctxify: '2.0'
mode: single-repo
repos:
  - ctxify
scanned_at: '2026-02-28T00:31:33.196Z'
---

# ctxify

A single-repo TypeScript CLI + library that scaffolds AI agent context workspaces. It detects repos, parses manifests mechanically, and generates `.ctxify/` markdown shards with TODO placeholders for agents to fill. Consumed as both a standalone CLI (`ctxify`) and a Node.js library (`import { ... } from 'ctxify'`).

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| [ctxify](repos/ctxify/overview.md) | typescript | commander | CLI tool + library for context scaffolding |

## Relationships

Single-repo workspace — no cross-repo relationships. The library (`src/index.ts`) is published to npm and consumed by external workspaces that run `ctxify init`.

## Commands

- **ctxify**: `npm run build` → `npm test` → `npm run typecheck`
- Run a specific test: `npx vitest run test/unit/{name}.test.ts`
- Build + watch: `npm run dev`

## Workflows

**Adding a CLI command:**
1. Create `src/cli/commands/{name}.ts` with `register{Name}Command(program: Command)`
2. Import and register in `bin/ctxify.ts`
3. Add unit tests in `test/unit/{name}.test.ts` (temp dir pattern)
4. Add integration test in `test/integration/` if it touches the filesystem end-to-end
5. Run `npm run build && npm test`

**Adding a new agent to skill installer:**
1. Add config to `AGENT_CONFIGS` in `src/cli/install-skill.ts`
2. Add to `AgentType` union in `src/cli/commands/init.ts`
3. Update `test/unit/install-skill.test.ts` with new agent assertions
4. Update README Supported agents table

**Debugging a test failure:**
Integration tests run `dist/bin/ctxify.js` — always `npm run build` first. Temp dirs are created per-test in `beforeEach`; check `afterEach` cleanup isn't deleting files needed for assertions.
