---
repo: ctxify
type: domain
domain: templates
---

# templates

Pure functions that produce markdown strings with YAML frontmatter and agent-facing placeholder comments. They take typed data structs and return strings — no file I/O, no side effects. The calling command does all writes. This separation makes templates easy to unit test and keeps command handlers thin.

## Key Files

- `src/templates/index-md.ts` — `generateIndexTemplate()`: workspace hub with repo table and relationship/workflow TODOs. Exports `RepoTemplateData` type
- `src/templates/repo.ts` — `generateRepoTemplate()`: per-repo hub (~30-40 lines). `filterEssentialScripts()` strips noise (prepublish, husky, etc.)
- `src/templates/domain.ts` — `generateDomainTemplate()`: domain deep-dive with frontmatter, Key Files, Patterns, Cross-repo TODOs
- `src/templates/patterns.ts` — `generatePatternsTemplate()`: patterns file with `type: patterns` frontmatter and TODO sections
- `src/templates/corrections.ts` — `generateCorrectionsTemplate()` + `formatCorrectionEntry()`: corrections file and individual entry formatting

## Patterns

**Input type → string output:**
```typescript
export function generateDomainTemplate(data: {
  repo: string;
  domain: string;
  tags?: string[];
  description?: string;
}): string {
  const fm = { repo: data.repo, type: 'domain', domain: data.domain, ...(data.tags ? { tags: data.tags } : {}) };
  return `---\n${dumpYaml(fm)}---\n\n# ${data.domain}\n\n<!-- placeholder for agent to fill -->`;
}
```

**TODO format:** HTML comment starting with `TODO: Agent —` followed by an imperative description. Invisible to markdown renderers, visible to agents scanning for unfilled sections.

**`filterEssentialScripts(scripts)`** (in `repo.ts`): keeps only scripts relevant for dev work (build, test, dev, start, lint, typecheck). Strips lifecycle hooks and tooling noise. Applied before writing overview.md.

**Line limit:** STOP Rule 7 enforces <150 lines per generated file. Templates with large TODO blocks stay short because TODOs are placeholders, not content.

## Cross-repo

Single-repo — no cross-repo interactions. Templates are consumed by `src/cli/commands/` and tested in `test/unit/templates.test.ts`.
