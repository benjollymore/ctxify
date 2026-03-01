---
repo: ctxify
type: patterns
---

# How to Build Features

How we build features here — the patterns and conventions that aren't obvious from reading one file.

## Adding a CLI Command

1. Create `/src/cli/commands/{command-name}.ts` with a `register{CommandName}Command(program)` function
2. Import and call the registration in `bin/ctxify.ts`: `register{CommandName}Command(program)`
3. Command handler parses args, calls business logic, outputs JSON to stdout: `console.log(JSON.stringify(result))`
4. Errors output `{ error: "message" }` and exit with code 1

Example: Adding `ctxify patterns <repo>` in `src/cli/commands/patterns.ts`:
```typescript
export function registerPatternsCommand(program: Command): void {
  program
    .command('patterns <repo>')
    .description('Scaffold patterns.md')
    .action(async (repo, options) => {
      const config = loadConfig(configPath);
      const content = generatePatternsTemplate({ repo });
      writeFileSync(patternsPath, content, 'utf-8');
      console.log(JSON.stringify({ status: 'scaffolded', repo, path: patternsPath }, null, 2));
    });
}
```

## Testing Pattern

Use vitest with isolated temp directories. Every test creates a temp dir in `beforeEach` and deletes it in `afterEach`. No shared state between tests.

```typescript
describe('validateShards', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });
  it('validates well-formed shards', () => { /* ... */ });
});
```

## Validation Approach

`validateShards()` does 5 checks: (1) index.md exists, (2) valid YAML frontmatter, (3) segment markers matched (<!-- tag -->...<!-- /tag -->), (4) TODO markers reported as warnings, (5) domain files referenced in index exist. See `src/core/validate.ts`.

## Naming Conventions

- Commands in kebab-case: `patterns`, `context-hook`
- Types: PascalCase + suffix (ValidateResult, ScaffoldOptions, RepoTemplateData)
- Files: kebab-case (init.ts, install-skill.ts, manifest.ts)
- JSON output keys: snake_case (status, shards_written, file_existed)

## Gotchas

- **JSON output is mandatory** — All commands must `console.log(JSON.stringify(...))`. Agents parse JSON; prose errors break parsing.
- **Temp dir cleanup in tests** — Forgetting `afterEach` cleanup can cause flaky test failures. Always pair `mkdtempSync` with `rmSync(dir, { recursive: true })`.
- **Manifest parsing fallback chain** — Try package.json first, then go.mod, then pyproject.toml. Return empty defaults if none found. See `parseRepoManifest()`.
- **Segment markers strip TODO blocks** — The validator ignores segment markers inside TODO comment blocks to avoid false positives on example code.
