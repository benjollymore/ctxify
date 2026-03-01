---
repo: ctxify
type: domain
domain: manifest-detection
---

# manifest-detection

Manifest detection reads manifests (package.json, go.mod, pyproject.toml, requirements.txt), detects language and framework, discovers entry points, identifies key directories, and counts files. The fallback chain (package.json → go.mod → pyproject.toml → requirements.txt) means the first manifest found wins; returns empty defaults if none found. Framework detection is keyword-matching against a hardcoded map of dependencies.

## Concepts

**ManifestData** is the output struct: `{language, framework, description, dependencies, devDependencies, scripts, manifestType, entryPoints[], keyDirs[], fileCount}`. **Framework detection** tries exact name match first (e.g., 'commander' dep → 'commander' framework), then prefix match (e.g., '@angular/' → 'angular'). **Entry point discovery** differs by manifest type: JavaScript reads `main`, `module`, `bin`, `exports` from package.json; Go checks `main.go` presence; Python scans for `if __name__ == '__main__'`. **Key directories** are discovered by walking the tree and filtering out noise (node_modules, __pycache__, tests, fixtures) and keeping only dirs ≤2 path segments (e.g., `src/services` kept, `src/services/auth/utils` dropped).

## Decisions

**Fallback chain over explicit config:** Instead of allowing users to specify which manifest to parse, the fallback chain (package.json → go.mod → pyproject.toml → requirements.txt) assumes one manifest per repo and stops at the first found. This is deterministic and requires no user config, but means monorepos with mixed languages need workarounds. **Hardcoded framework indicators:** Framework detection uses a static map of common dependencies rather than parsing all deps. Misses obscure frameworks but keeps the logic fast and predictable. **Empty defaults for missing manifests:** If no manifest found, return empty strings/arrays rather than throwing. This allows `ctxify init` to succeed even in repos with no recognized manifest, with agents then documenting the project manually. **Skip manifest re-reading:** `discoverEntryPoints()` re-reads the manifest that the caller already parsed — a known inefficiency but keeps discovery logic isolated.

## Patterns

**Framework detection pattern:** Loop over `FRAMEWORK_INDICATORS` map, check if any indicator appears in dep names (exact or prefix match). First match wins. Example: `express` dep → match in FRAMEWORK_INDICATORS['express'] → return 'express'.

**Entry point path resolution:** Use `addEntry()` helper to resolve relative paths (e.g., `./dist/index.js`) to relative-from-repo (e.g., `dist/index.js`) — strips leading `./` and validates the file exists before adding.

**Directory filtering:** Walk tree with `readdirSync()`, filter by `NOISE_DIR_PATTERNS` and depth ≤2. Noise patterns include test dirs, cache, patches. Depth check prevents documenting internal subdirs like `src/services/auth/middleware/utils`.

## Cross-repo

`parseRepoManifest()` is called once per repo in `scaffoldWorkspace()` to populate the `RepoTemplateData` that gets written to overview.md. In multi-repo and mono-repo workspaces, each repo is parsed independently — no aggregation or cross-repo dependency detection. The only cross-repo signal is in the config (ctx.yaml `relationships[]` array), which is user-provided, not auto-detected.
