---
repo: ctxify
type: domain
domain: workspace-scaffolding
---

# workspace-scaffolding

Workspace scaffolding detects workspace topology (single-repo, multi-repo, mono-repo), finds repos and packages, generates config (ctx.yaml), and orchestrates file I/O (writing .ctxify/ shards). The `autoDetectMode()` function checks for mono-repo indicators first (pnpm-workspace.yaml, root package.json workspaces field), then searches for multiple git roots (multi-repo), defaulting to single-repo.

## Concepts

**Operating modes:** single-repo (workspace == repo), multi-repo (≥2 independent git roots in subdirs), mono-repo (one git root, multiple packages via workspace config). **MonoRepoDetection** struct holds: detected (bool), manager (npm|yarn|pnpm|turborepo|null), packageGlobs (from config), packages (resolved list). **Mode detection order:** (1) Check for pnpm-workspace.yaml, (2) Check root package.json workspaces field, (3) Glob to resolve packages using the globs, (4) Check turbo.json to set manager, (5) Check yarn.lock vs package-lock.json to distinguish yarn/npm. **RepoEntry:** represents a repo in ctx.yaml with path (relative to workspace), name, and optional language/framework/description overrides. **ScaffoldWorkspace:** orchestrator that installs skills, writes ctx.yaml, parses all repo manifests, and generates all templates to .ctxify/.

## Decisions

**Separate detection from scaffolding:** `autoDetectMode()` just detects mode; `scaffoldWorkspace()` orchestrates the full flow. Keeps detection testable independently. **Mode detection heuristics over explicit config:** Auto-detect mode from workspace structure rather than asking users. pnpm-workspace.yaml is the single source of truth for pnpm; turbo.json presence triggers turborepo mode; otherwise default to yarn/npm. **Package globbing via glob library:** Mono-repos specify package paths as globs (e.g., `packages/*`); we use the `glob` npm library to resolve them. This is deterministic and matches how package managers work. **Interactive flow as opt-in:** When ctxify init is run with a TTY and no flags, prompt users for agent + mode. Non-TTY or any flag provided bypasses interactivity. Both paths call the same scaffoldWorkspace() function.

## Patterns

**Mode detection flow:** `autoDetectMode(dir)` → `detectMonoRepo(dir)` if detected return {mode: 'mono-repo', manager, packageGlobs} → else `findGitRoots(dir, depth=3)` → filter roots != workspace root → if ≥2 subdir roots return {mode: 'multi-repo'} → else {mode: 'single-repo'}.

**Repo entry creation:** For single-repo: `[{path: '.', name: 'my-app'}]`. For multi-repo: `[{path: 'api', name: 'api'}, {path: 'web', name: 'web'}]`. For mono-repo: globs resolved, then `[{path: 'packages/core', name: 'core'}, {path: 'packages/ui', name: 'ui'}]`.

**Scaffold orchestration:** Install skills → Generate ctx.yaml → For each repo: parseRepoManifest() → Generate templates → Write files → Return result with status, mode, repos, skills_installed[].

## Cross-repo

Workspace scaffolding is fundamentally cross-repo: it detects all repos in the workspace and generates a unified context structure (.ctxify/ with index.md as the hub and repos/{name}/ as the spokes). The index.md template includes a repo table and relationships section (though relationships are user-provided via ctx.yaml, not auto-detected). Multi-repo and mono-repo modes both generate the same shard structure; the mode field in ctx.yaml and index.md frontmatter is the only difference.
