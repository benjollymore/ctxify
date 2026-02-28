---
repo: ctxify
type: overview
language: typescript
framework: commander
---

# ctxify

ctxify is a scaffolder + validator that builds persistent workspace context for AI agents. It detects repos, parses manifests (package.json, go.mod, pyproject.toml), and scaffolds `.ctxify/` with markdown templates pre-filled with mechanical data and TODO placeholders. Agents read the templates, explore source code, and fill semantic content (architecture, patterns, domain knowledge). On future sessions, agents load the filled context and start with a senior engineer's understanding of the codebase. Consumed by: Claude Code, Copilot, Cursor, and Codex agents; called by `ctxify init`.

## Architecture

- `bin/` — CLI entry point (bin/ctxify.ts). Registers 11 Commander.js commands, reads package.json version, polyfills Array.findLastIndex for Node 18, installs non-blocking update check hooks.
- `src/` — Source root (ESM + TypeScript strict mode, no CommonJS).
- `src/cli/` — Command handlers. One file per command (init, patterns, domain, validate, status, feedback, upgrade, clean, branch, commit, context-hook). Each registers with Commander and outputs JSON.
- `src/core/` — Business logic. Config parsing/validation, manifest detection (language/framework/deps), validation rules, mode detection (single/multi/mono-repo).
- `src/templates/` — Pure functions generating markdown templates. RepoTemplate, PatternsTemplate, DomainTemplate, IndexTemplate.
- `src/utils/` — Shared utilities. Frontmatter extraction, segment markers (HTML comments), YAML helpers, git commands, fs helpers, monorepo detection, version checks.

### Data flow

User runs `ctxify init` → auto-detect mode + repos → parse manifests → generate templates → install skills → write ctx.yaml. On future calls, load ctx.yaml → dispatch to command handler → read shards if needed → output JSON. Template generators are pure functions (no I/O); init command handles file writes. This separation keeps generators testable and reusable.

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
- `init.md` — Workspace detection, scaffolding, skill installation
- `validation.md` — Structural integrity, shard format, frontmatter, segment markers
- `manifest-detection.md` — Language, framework, entry points, dependency parsing
- `skill-installation.md` — Agent-specific files, scopes, hook setup, skill lifecycle
- `cli-commands.md` — Command registration, JSON output, error handling, CLI patterns
<!-- /domain-index -->
