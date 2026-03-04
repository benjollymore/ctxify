---
name: ctxify:multi-repo
description: Use when working in a ctxify multi-repo workspace — covers coordinated branches, commits, and context persistence across repos.
---

# ctxify:multi-repo — Multi-repo Workspace Guide

## Hard Gate

If `ctx.yaml` has `mode: multi-repo`, you MUST read this skill before:
- Starting any feature that touches 2+ repos
- Committing changes across repos

## Context Persistence

In multi-repo mode, context files live **inside each repo** — not in a central `.ctxify/repos/` directory. This means context is version-controlled with the code it describes, using regular git.

**Where context lives:**
- Per-repo context: `{repo}/.ctxify/overview.md`, `patterns.md`, `corrections.md`, domain files
- Workspace context: `{primary_repo}/.ctxify/workspace.md` (cross-repo relationships, workflows), `{primary_repo}/.ctxify/rules.md` (behavioral rules — workspace-wide, not per-repo)
- Root `.ctxify/index.md`: generated hub with links — not the source of truth

**Committing context:** Regular `git add .ctxify/ && git commit` from inside each repo. No special tooling needed. Context travels with the code.

**Always run agents from the workspace root** for full cross-repo context visibility.

## Coordinated Git Commands

**Create a matching branch in all repos:**
```
ctxify branch feat/add-notifications
```
Creates the branch in every repo listed in `ctx.yaml`. Output shows the previous branch per repo.

**Commit changes across all repos:**
```
ctxify commit "feat: add notification support"
```
Stages and commits in every repo that has changes. Clean repos are skipped automatically.

## When to Use Coordinated Git

- Cross-repo features touching multiple repos in a single task
- Keeping branches aligned for a coherent PR set
- Multi-repo mode only — errors in single-repo and mono-repo workspaces

## When NOT to Use Coordinated Git

- **Single-repo work** — use git directly
- **When repos need different commit messages** — commit each repo individually with git
- **When only one repo has changes** — use git directly in that repo

## Running From the Workspace Root

**Always open your editor at the workspace root** — the directory containing `ctx.yaml`. Do not open editors inside sub-repos (e.g., `workspace/api/`).

If you open inside a sub-repo:
- The context hook walks up and still loads context, but `.claude/settings.json` at the workspace root won't be found
- CLI commands will warn and auto-resolve to the workspace root, but agents and hooks may not

If context isn't loading, check that CWD is the workspace root (where `ctx.yaml` lives), not a sub-repo directory.

## Workflow

1. `ctxify branch feat/your-feature` — create branches in all repos
2. Implement the feature across repos
3. `ctxify commit "feat: describe the change"` — stage and commit all repos with changes
4. Open PRs from each repo's feature branch
