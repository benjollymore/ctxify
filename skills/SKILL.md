---
name: ctxify
description: Use before writing, modifying, or debugging code in a ctxify workspace — loads architecture, patterns, and coding conventions so you build correctly.
---

# ctxify — Load Context Before Coding

## Before Starting Any Task

Check for `ctx.yaml` at workspace root.

- **Not found** → Go to First-time Setup below.
- **Found** → Read `ctx.yaml` to determine mode (`single-repo`, `multi-repo`, `mono-repo`). Continue to "Check Context State".

## Version Check

If this skill has a `version` field in its frontmatter, compare it against the output of `ctxify --version`. If they differ, tell the user: "ctxify skills are from v{X} but v{Y} is installed. Run `ctxify upgrade` to update." Continue regardless — don't block on this.

## Check Context State

**Multi-repo mode:** Read each `{repo_path}/.ctxify/overview.md` (paths from `ctx.yaml` repos[].path).
**Single/mono-repo mode:** Read `.ctxify/index.md` and each `.ctxify/repos/{name}/overview.md`.

If any overview.md contains `<!-- TODO:` markers, context is **unfilled**:
- User explicitly requested context setup (e.g., "set up context", "/ctxify") → proceed directly: invoke **ctxify:filling-context**.
- Startup was auto-triggered (session hook, prerequisite) → ask briefly: "Context files are unfilled. Fill them now, or skip and start on your task?"

If no TODO markers → context is filled. Continue to "Load Context Files".

## Load Context Files

**Path resolution** — all paths below are relative to workspace root:
- **Multi-repo mode:** Replace `{CTX}/` with `{repo_path}/.ctxify/` (per-repo context). Also load `workspace.md` and `rules.md` from the primary repo's `.ctxify/` (identified by `primary_repo` in ctx.yaml).
- **Single/mono-repo mode:** Replace `{CTX}/` with `.ctxify/repos/{name}/`. `rules.md` lives at `.ctxify/rules.md` (workspace root).

| File | Load when |
|------|-----------|
| `.ctxify/index.md` | Every session |
| `{CTX}/overview.md` | Every session |
| `{CTX}/corrections.md` | Every session — past mistakes to avoid |
| `.ctxify/rules.md` | Every session — behavioral instructions (workspace level) |
| `{CTX}/workspace.md` | Every session — multi-repo only, primary repo only |
| `{CTX}/patterns.md` | Before writing or modifying code |
| `{CTX}/{domain}.md` | When working in that specific domain |

Read the "Every session" files now. Load patterns.md and domain files when you reach a coding task that needs them.

**Claude Code note:** The SessionStart hook pre-loads always-load files (index.md, overview.md, corrections.md, rules.md, workspace.md) into context automatically. If you see this content already in session context, skip to loading patterns.md and domain files as needed.

If context looks stale or a `corrections.md` contradicts an overview, note it.
When you discover wrong context during a task — invoke **ctxify:corrections**.
When the user corrects your behavior — invoke **ctxify:rules**.

## First-time Setup

All repos must be subdirectories of the workspace root. Run ctxify from that root.

| Layout | Command |
|--------|---------|
| Single manifest at root only | `ctxify init` |
| Root manifest with `workspaces` field | `ctxify init --mono` |
| Multiple subdirs with manifests | `ctxify init --repos ./a ./b ./c` |
| Multi-repo with explicit primary | `ctxify init --repos ./a ./b --primary-repo a` |

Add `--agent claude` (or copilot/cursor/codex) to install agent playbooks alongside scaffolding.

In multi-repo mode, `--primary-repo` designates which repo hosts workspace-level context (workspace.md). Defaults to the first repo if omitted.

After init — invoke **ctxify:filling-context** to document what you learn about the codebase.

## Refreshing Context

**NEVER run `ctxify init` to refresh existing context.** Init scaffolds empty templates — running it again overwrites agent-filled content with blank TODOs.

To refresh context:
- **Check quality:** Run `ctxify audit` to find unfilled TODOs, stale sections, or size issues.
- **Update specific files:** Edit `.ctxify/` files directly.
- **Add new domains:** Invoke **ctxify:domain** to scaffold new domain files without touching existing ones.
- **Log corrections:** Invoke **ctxify:corrections** when you discover wrong context.

## Handoffs

- **Filling/writing context files** → invoke `ctxify:filling-context`
- **Checking context quality** → run `ctxify audit` (token budget, unfilled TODOs, prose walls, size issues)
- **Creating a new domain file** → invoke `ctxify:domain`
- **Logging a correction** → invoke `ctxify:corrections`
- **Logging a behavioral rule** → invoke `ctxify:rules`
- **Cross-repo branch/commit coordination** → invoke `ctxify:multi-repo`

## Multi-repo: When to Use Git Skills

If `ctx.yaml` has `mode: multi-repo`, these triggers apply:

- **Any feature touching 2+ repos** → invoke `ctxify:multi-repo` BEFORE writing code. Create coordinated branches first.
- **Committing changes that span repos** → use `ctxify commit` (not plain `git commit`) to keep commit messages aligned.
- **Context files live inside each repo** — they are committed with regular `git add .ctxify/ && git commit` from within each repo. No special tooling needed for context persistence.
- **Always run agents from workspace root** for full cross-repo context visibility.
