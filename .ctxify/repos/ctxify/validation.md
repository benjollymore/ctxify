---
repo: ctxify
type: domain
domain: validation
---

# validation

Validation checks structural integrity of context shards. `validateShards()` verifies: (1) index.md exists, (2) valid YAML frontmatter in index.md, (3) segment markers are balanced (opening and closing count match), (4) domain files referenced in overview.md exist on disk, (5) TODO markers are absent (warns if present). Returns `{valid, errors[], warnings[]}` — errors are blockers, warnings are content issues.

## Concepts

**Segment marker:** HTML comment pair like `<!-- tag:attr1:attr2 -->...<!-- /tag -->`. Supported tags: endpoint, type, env, model, question, domain-index, correction, antipattern, rule. Markers must be balanced (opening count == closing count). Attributes are optional colon-separated strings; stored as metadata for queryable segments. **TODO strips before validation:** Before checking segment markers, the validator runs `stripTodoBlocks()` to remove multi-line TODO comments (which may contain example markers), so example code in TODOs doesn't trigger false positives. **Domain-index tracking:** overview.md contains a marker block listing domains (delimited by HTML comments). Validator parses this and checks that each listed domain file exists in the repo dir. **Validation states:** Valid = no errors, warnings allowed. Invalid = errors present (blocks workflows).

## Decisions

**Structural over semantic:** Validation checks file existence, frontmatter syntax, and marker balance, not content quality. An overview.md with all TODOs still passes validation (just warns). Semantic quality is agent responsibility. **Segment marker flexibility:** Rather than enforcing a specific tag set, we support active tags (endpoint, type, env, model, correction, antipattern, rule, question, domain-index) and ignore unknown tags. Allows future extension without code changes. **TODO stripping before marker check:** This prevents example markers in TODO blocks from falsely triggering "unmatched marker" errors. Multi-line placeholder blocks are stripped with a regex that respects single-line vs multi-line comment boundaries. **Domain file tracking via markers:** Domain files are discovered by parsing the domain-index marker block in overview.md, not by scanning the filesystem. This makes the shard structure explicit and agent-editable.

## Patterns

**Validation flow:** (1) Check index.md exists, (2) Parse frontmatter, (3) Collect all .md files recursively, (4) For each file: strip TODO blocks → check segment markers balanced, (5) For each file: check TODO markers present (warn if found), (6) Check domain files exist → return `{valid: errors.length === 0, errors, warnings}`.

**Segment marker check:** For each active tag, count `<!-- tag:` patterns and `<!-- /tag -->` patterns using regex. If counts differ, push error: `"unmatched segment marker "{tag}" in {file}: {open} opening vs {close} closing"`.

**Domain file extraction:** Parse overview.md, find `<!-- domain-index -->...<!-- /domain-index -->` block, extract lines matching `- \`{name}.md\`` pattern, check each file exists in repo dir.

## Cross-repo

In multi-repo and mono-repo workspaces, `validateShards()` runs once per workspace (called with workspaceRoot), validates the entire .ctxify/ tree (index.md + all repos/{name}/ subdirs). Each repo's overview.md is validated independently — domain files are checked within repos/{name}/, not cross-repo. The index.md workspace-level relationships are not validated structurally (that's semantic, not structural).
