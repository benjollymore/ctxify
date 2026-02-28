---
repo: ctxify
type: domain
domain: init
---

# init

The init domain covers workspace detection and scaffolding: discovering git roots, parsing manifests, selecting operating mode, generating `.ctxify/` shard files, and optionally installing agent skills. Two paths exist — interactive (TTY) and flag-driven (CI/agent) — but both call the same `scaffoldWorkspace()` function.

## Key Files

- `src/cli/commands/init.ts` — `scaffoldWorkspace()`: the core function. Installs skills first (so paths go into ctx.yaml), writes ctx.yaml, then writes index.md + per-repo overview.md
- `src/cli/commands/init-interactive.ts` — `runInteractiveFlow()`: @inquirer/prompts UI for agent/mode/repo selection, returns `ScaffoldOptions`
- `src/core/manifest.ts` — `parseRepoManifest()`: fallback chain (package.json → go.mod → pyproject → requirements.txt)
- `src/core/detect.ts` — `autoDetectMode()`: determines single-repo / multi-repo / mono-repo from workspace structure
- `src/utils/monorepo.ts` — `detectMonoRepo()`: pnpm/yarn/npm/turborepo workspace glob resolution
- `src/utils/git.ts` — `findGitRoots()`: synchronous git root discovery for multi-repo detection

## Patterns

**Interactive vs flag-driven:** The command checks `process.stdin.isTTY && !options.repos && !options.mono` to decide. Non-TTY stdin or presence of flags goes to auto-detect.

**Skills installed before ctx.yaml is written:** `scaffoldWorkspace()` installs skills first to get the dest path, then writes that path into `skillsMap` which becomes part of `ctx.yaml`'s `skills` field.

**Manifest fallback chain:** `parseRepoManifest(repoPath)` tries manifests in order. First found wins. Returns safe defaults (empty strings/arrays) if no manifest. Never throws.

**`--force` flag:** Overwrites existing shard files. Without it, existing files are skipped silently (idempotent).

**`detectInstallMethod(argv1?)`** inspects `process.argv[1]` for `_npx` or `node_modules` strings to classify how ctxify was invoked. Injected in tests via the optional parameter.

## Cross-repo

Single-repo project — no cross-repo interactions.
