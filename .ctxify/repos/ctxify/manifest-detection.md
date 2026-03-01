---
repo: ctxify
type: domain
domain: manifest-detection
---

# Manifest Detection

## Overview

Detects language and framework by parsing manifest files (package.json, go.mod, pyproject.toml, requirements.txt) and discovering entry points, key directories, and code statistics. The output populates overview.md frontmatter and guides agents when reading source code.

## Concepts

**Manifest fallback chain:** Try package.json first → go.mod → pyproject.toml → requirements.txt. First found wins. Returns empty defaults if none found. This ensures even bare repos get a minimal manifest.

**Framework detection via dependencies:** For JS/TS, scan package.json dependencies for framework indicators (e.g., 'react', 'express', '@angular/core'). For Go, grep go.mod for common imports (gin, echo, gorilla). For Python, substring match in requirements or pyproject. One framework per repo.

**Entry point resolution:** Follows manifest conventions per language. package.json: main, module, bin, exports. go.mod: cmd/{app}/main.go. pyproject.toml: [project.scripts] or [tool.poetry.scripts]. Includes smart path resolution: prefer source .ts over build dist/.js, handle relative imports.

**Key directories:** Walk repo up to depth 3, identify dirs containing code files (.ts, .js, .py, .go, .rs, etc.). Exclude node_modules, .git, dist, etc. Later filtered by `repo.ts` template to exclude noise (tests, fixtures, patches) and cap to 2 path segments.

## Decisions

**Why fallback chain?** Allows detection of single-repo (JS), multi-language mono-repos (monorepo with Node + Python), and repos with no manifest (returns empty). Deterministic ordering prevents ambiguity if multiple manifests exist.

**Why not extract all frameworks?** Many repos use multiple frameworks (React frontend + Express backend). Listing one reduces noise. Agents discover others by reading source; overview.md is a hub, not a catalog.

**Why resolve source paths, not dist paths?** dist/ is generated—it changes on build. Agents need stable refs to read source. `resolveSourcePath()` strips dist/ prefix and looks for .ts equivalents, then src/ prefixed versions, then raw path.

## Patterns

**Re-read prevention:** `discoverEntryPoints()` re-reads package.json even though init.ts already read it. See `manifest.ts:183–184`. Fixable but low priority—I/O is cheap; refactoring adds coupling.

**Segment markers for manifests:** None used. Manifest parsing output is deterministic and non-semantic—not a shard that agents edit. Only shards (overview, patterns, domains) use segment markers.
