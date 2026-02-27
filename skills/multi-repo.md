---
name: ctxify:multi-repo
description: Use when working on a cross-repo feature in a ctxify multi-repo workspace that requires coordinated branches and commits.
---

# ctxify:multi-repo — Multi-repo Git Workflow

## Hard Gate

Create matching branches in ALL repos BEFORE starting feature work. Never start implementing a cross-repo feature on the default branch.

## Commands

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

## When to Use

- Cross-repo features touching multiple repos in a single task
- Keeping branches aligned for a coherent PR set
- Multi-repo mode only — errors in single-repo and mono-repo workspaces

## When NOT to Use

- **Single-repo work** — use git directly
- **When repos need different commit messages** — commit each repo individually with git
- **When only one repo has changes** — use git directly in that repo

## Workflow

1. `ctxify branch feat/your-feature` — create branches in all repos
2. Implement the feature across repos
3. `ctxify commit "feat: describe the change"` — stage and commit all repos with changes
4. Open PRs from each repo's feature branch
