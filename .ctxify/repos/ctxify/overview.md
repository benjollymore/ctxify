---
repo: ctxify
type: overview
language: typescript
framework: commander
---

# ctxify

ctxify is an npm library and CLI tool that scaffolds and validates persistent context for AI coding agents. It detects Git repos, parses language manifests (package.json, go.mod, pyproject.toml), infers architecture, and generates markdown templates in `.ctxify/` that agents fill with semantic content (patterns, architecture, domains). The library also exports configuration, validation, and frontmatter utilities for programmatic use. ctxify is a scaffolder and validator, not an analyzer—it automates mechanical extraction (framework detection, entry point discovery, manifest parsing) and leaves semantic analysis to agents reading source code directly.

## Architecture

- `bin/ctxify.ts` — CLI entry point. Uses Commander.js to register all commands (init, patterns, validate, etc.) and coordinate command dispatch. Handles version discovery and update checks.
- `src/core/` — Business logic layer: config loading/serialization, manifest parsing (package.json → framework detection), workspace detection, validation (segment markers, TODOs, frontmatter), and error handling.
- `src/templates/` — Pure markdown generators: each template function takes typed data and returns a string. No I/O—the init command handles file writing. One generator per shard type (overview.md, patterns.md, domain.md, etc.).
- `src/cli/commands/` — Command handlers. Each registers with Commander, parses arguments, calls business logic, and outputs JSON (success or error). Interactive prompts (init) live in init-interactive.ts.
- `src/utils/` — Shared utilities: YAML/frontmatter parsing, git operations, filesystem ops, segment extraction, monorepo detection, version checking.
- `src/index.ts` — Library exports: config, manifest, validate, detect, frontmatter, segments. Agents and tools can import programmatically.

**Data flow:** CLI → command handler → business logic → templates (generate strings) → file write. Commands always output JSON for agent parsability. Templates are decoupled from I/O so they can be tested independently. Validation (validateShards) runs post-scaffolding to ensure structural integrity: frontmatter syntax, segment marker matching, TODO markers, domain file references.

**Key architectural insight:** Manifests and structure are detected mechanically; semantic content (patterns, architecture, domains) is supplied by agents reading source directly. This division lets agents focus on high-value semantic analysis while ctxify automates routine scaffolding and structural checks. Read patterns.md for how to add new commands and tests; see manifest-detection.md and skill-installation.md for domain deep-dives.

## Domains

<!-- domain-index -->
- `manifest-detection.md` — Language and framework detection via manifest parsing with fallback chains
- `skill-installation.md` — Multi-agent skill distribution with agent-specific file structures and installation scopes
- `corrections.md` — Feedback loop: corrections, rules, and anti-patterns logged by agents during sessions
<!-- /domain-index -->
