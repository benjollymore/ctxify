---
repo: ctxify
type: domain
domain: manifest-detection
---

# manifest-detection

Parses repo manifests (package.json, go.mod, pyproject.toml, requirements.txt) to extract language, framework, dependencies, entry points, and key directories. Uses a fallback chain: first manifest found wins. Framework detection is dependency-based: looks for known deps in imports/requires. Output feeds template generation (overview.md key dirs) and config metadata.

## Concepts

**Manifest fallback chain**: tries package.json → go.mod → pyproject.toml → requirements.txt in order. First found wins; if malformed, error halts. Returns empty defaults if no manifest found. **Language detection**: inferred from manifest type (package.json = TypeScript/JavaScript, go.mod = Go, pyproject.toml/requirements.txt = Python). **Framework detection**: scans dependencies for known indicators (react, vue, angular, svelte, express, hono, fastify, nestjs, django, flask, fastapi, prisma, drizzle, commander, etc.). Single best match returned. **Entry points**: extracted from main, module, bin, exports in package.json; main.go in Go; __main__ in Python. **Key directories**: collected by walking filesystem, filtering to ≤2 path segments deep, excluding test/fixture/cache patterns. Used to populate overview.md Architecture section. **File count**: recursive scan excluding defaults (node_modules, .git, dist, build, etc.).

## Decisions

**Fallback chain over hardcoded mappings.** Trying all manifests in order is simpler than language→manifest mappings and scales to new languages. If pkg.json is missing/malformed but go.mod exists, error halts (no fallback). Trade-off: requires robust error handling. **Framework detection via dependencies.** Scanning imports/requires is cheaper than AST analysis and covers the common cases. Single best match simplifies output; if multiple frameworks detected, last one wins. **Key dirs ≤2 segments deep.** Avoids bloat from deep nesting (src/services/dropoff/query/resolvers/foo/bar). Filters test patterns (tests, __tests__, fixtures, coverage, mocks) to reduce noise. **Entry point discovery per-manifest.** package.json has explicit fields (main, bin); Go has main.go convention; Python has __main__. Language-specific logic in separate parsers. **File count recursive scan.** Used to show repo scale in templates; not semantic analysis.

## Patterns

**Manifest parsing with fallback**: `parseRepoManifest()` tries each manifest type in order via helper functions (parsePackageJson, parseGoMod, etc.). If file not found or parse fails, next manifest tried. Returns empty defaults if none found. Example: `const data = parseRepoManifest(repoPath)` returns ManifestData with language, framework, dependencies, entryPoints, keyDirs. **Dependency scanning for framework detection**: iterate dependencies and devDependencies, check if any key matches FRAMEWORK_INDICATORS object: `{ react: ['react', 'react-dom', 'next'], ... }`. Return first matching framework. **Directory filtering**: recursively walk repo, collect all dirs, filter by segment count and noise patterns, return top N. Used by `filterKeyDirs()` in template generator.

## Cross-repo

`parseRepoManifest()` is called per-repo during init. Each repo's manifest is detected independently; no cross-repo dependency analysis. Relationship types (dependency, api-consumer, shared-db) are filled by agents in ctx.yaml after reading code, not auto-detected.
