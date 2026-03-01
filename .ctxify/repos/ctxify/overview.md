---
repo: ctxify
type: overview
language: typescript
framework: commander
---

# ctxify

ctxify is a scaffolder + validator that generates persistent workspace context for AI coding agents. It detects repos, parses manifests (language, framework, dependencies, entry points), and scaffolds `.ctxify/` with markdown templates that agents read and fill with semantic content (architecture, patterns, decisions, domain knowledge). ctxify handles the deterministic mechanical part (parsing package.json, discovering frameworks, counting files). Agents do what they do best: read source code and document *why* things are built the way they are. The output is consumed by any AI coding agent (Claude Code, Copilot, Cursor, Codex) as workspace context files that ship with the repo.

## Architecture

- `bin/ctxify.ts` — CLI entry point (Commander.js program setup, command registration, version check, error handling)
- `src/cli/commands/` — Command handlers (init, status, validate, patterns, domain, feedback, etc.) — one file per command
- `src/core/` — Business logic (config loading, manifest parsing, mode detection, validation rules)
- `src/templates/` — Template generators (pure functions that return markdown strings for scaffolding)
- `src/utils/` — Shared utilities (fs, git, yaml parsing, frontmatter extraction, segment markers)
- `src/index.ts` — Library exports for programmatic use (config, manifest, validate, detect, frontmatter, segments)

Request flow: `ctxify init` → CLI registers command handler → `scaffoldWorkspace()` detects repos + mode → `parseRepoManifest()` reads manifests (package.json, go.mod, etc.) → templates generate markdown → write shards to `.ctxify/`. The key insight is the split of labor: manifest parsing is deterministic (happens in `src/core/manifest.ts`), template generation is pure (returns strings, no side effects), and file I/O is centralized (only in CLI commands or `scaffoldWorkspace`). This layering keeps business logic testable without mocking the filesystem. Commands output JSON for agent consumption. Validation (`validateShards`) checks structural integrity (frontmatter, segment markers, missing domain files). Agents invoke `ctxify domain add` and `ctxify patterns` to scaffold content, then fill semantic details. The skill installer (`install-skill.ts`) handles agent-specific file placement (`.claude/skills/ctxify`, `.github/instructions`, etc.) with multi-file or single-file output depending on agent capabilities.

## Context

After reading the codebase, create these sibling files in this directory:

**`patterns.md`** — How to build features in this repo. The most important file.
Include: end-to-end feature patterns, validation approach, testing patterns, naming
conventions, gotchas and tips. 20-50 lines with brief code examples.

**`corrections.md`** — Agent-logged factual corrections (created by `ctxify feedback`).
Always loaded — prevents repeating past mistakes.

**`rules.md`** — Behavioral instructions and anti-patterns (created by `ctxify feedback --type rule`).
Always loaded — the highest-signal context.

**Domain files** — One `{domain}.md` per complex domain area (3-5 domains).
Each covers: key concepts, business rules, decisions, domain-specific patterns,
cross-repo interactions. 50-150 lines each.

<!-- domain-index -->
- `manifest-detection.md` — Parsing manifests and detecting frameworks, languages, and entry points
- `workspace-scaffolding.md` — Detecting workspace topology, generating configs, coordinating file I/O
- `agent-skills.md` — Multi-agent skill installation with agent-specific file placement
- `validation.md` — Structural integrity checking of shards and context
<!-- /domain-index -->
