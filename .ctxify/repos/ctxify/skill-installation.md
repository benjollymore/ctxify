---
repo: ctxify
type: domain
domain: skill-installation
---

# Skill Installation

## Overview

Distributes six skill .md files from `skills/` to agent-specific directories with agent-specific frontmatter and file structures. Handles Claude Code (multi-file with satellites), Copilot/Codex (single-file concatenation), and Cursor (multi-file). Also installs Claude Code SessionStart hook for auto-context-loading.

## Concepts

**Agent types and configurations:** AGENT_CONFIGS defines displayName, destDir, primaryFilename, frontmatter builder, singleFile flag, and globalDestDir. Agents map to editor conventions: Claude → .claude/skills/ctxify/, Copilot → .github/instructions, Cursor → .cursor/rules, Codex → . or $HOME/.codex.

**Installation scopes:** Workspace (in repo) or global ($HOME). Only claude and codex support global; others workspace-only. Scope is persisted in ctx.yaml skills map.

**Multi-file vs single-file agents:**
- Multi-file (claude, cursor): Each skill .md file stripped of source frontmatter, re-frontmatted with agent-specific metadata, written separately.
- Single-file (copilot, codex): All skill bodies concatenated with agent-wide frontmatter prepended.

**Satellite skills for Claude Code:** When Claude Code installs satellite skills (non-SKILL.md), they get sibling directories: .claude/skills/ctxify-patterns/, .claude/skills/ctxify-domain/ etc. Claude Code requires dir/SKILL.md structure for each invokable skill.

**Stale file cleanup:** Marks installed files with version comment `<!-- ctxify v... -->`. On re-run, cleans satellite dirs by prefix match (e.g., ctxify-*) and base dir by version marker. Prevents accumulation of deleted skills.

## Decisions

**Why separate skills from main templates?** Templates are repo-specific; skills are workspace-wide agent conventions. Skills live in package; templates are generated per-repo in .ctxify/. Keeps concerns separate.

**Why agent-specific frontmatter?** Each agent reads .md differently. Claude Code requires name/description/version for skill registry. Cursor expects alwaysApply boolean. Copilot uses applyTo glob. Normalizing to source frontmatter loses this metadata.

**Why satellite directories?** Claude Code won't register multiple .md files in one dir as separate skills—it requires dir/SKILL.md. So patterns.md becomes .claude/skills/ctxify-patterns/SKILL.md.
