---
repo: ctxify
type: domain
domain: validate
---

# validate

Structural integrity checks for `.ctxify/` shard files. Validates that files have valid YAML frontmatter, segment markers are balanced (every open `<!-- tag -->` has a matching `<!-- /tag -->`), and no unfilled agent placeholder comments remain. Exits 1 on failure. Used both as a CLI command (`ctxify validate`) and programmatically via the library export.

## Key Files

- `src/core/validate.ts` — `validateShards()`: main entry. `collectMdFiles()`: recursive .md file discovery
- `src/utils/frontmatter.ts` — `parseFrontmatter()`: extract YAML between `---` delimiters at file start
- `src/utils/segments.ts` — `extractSegments()`: parse `<!-- tag:attrs -->...<!-- /tag -->` blocks with attribute filtering
- `src/cli/commands/validate.ts` — CLI wrapper: calls `validateShards()`, formats errors, `process.exit(1)` on failure
- `test/unit/validate.test.ts` — unit tests for frontmatter checks, segment balance, TODO detection

## Patterns

**Three checks per file:**
1. Frontmatter present and parseable (YAML between `---` at file start)
2. Segment markers balanced — for every `<!-- tag -->` there must be a `<!-- /tag -->`
3. No unfilled agent placeholder comments (validate rejects any file still containing them)

**Known issue:** `validateShards()` reads each file twice — once for segment marker check, once for TODO check. Low priority but noted in CLAUDE.md.

**Segment marker format:**
```
<!-- endpoint:GET:/users -->
content
<!-- /endpoint -->
```
Tag names are lowercase. Attributes are colon-separated after the tag. `extractSegments()` supports filtering by tag and attribute values.

**CLI exit codes:** `0` = all valid, `1` = one or more validation failures. Error output is JSON with `error` field.

## Cross-repo

Single-repo. The `validateShards()` function is also exported from `src/index.ts` for programmatic use by other tools.
