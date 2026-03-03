---
repo: ctxify
type: patterns
ctxify_version: 0.7.1
---

# How to Build Features

Conventions for adding commands, templates, and tests — the patterns that aren't obvious from one file.

## Adding a Command

Three steps: create the handler file, implement with JSON output, register in bin entry.

```typescript
// 1. src/cli/commands/myfeature.ts
export function registerMyFeatureCommand(program: Command): void {
  program.command('myfeature <repo>')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (repo: string, options: { dir?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const result = doTheThing(workspaceRoot, repo);
      console.log(JSON.stringify(result, null, 2));
    });
}
// 2. bin/ctxify.ts: import { registerMyFeatureCommand } from '../src/cli/commands/myfeature.js';
//    registerMyFeatureCommand(program);
```

## Adding a Template

Pure function in `src/templates/` — typed data in, markdown string out. No file I/O, no `core/` imports.

```typescript
// src/templates/mytemplate.ts
export interface MyTemplateData { repo: string; name: string }
export function generateMyTemplate(data: MyTemplateData): string {
  return `# ${data.name}\n\n`;
}
// The calling command in src/cli/commands/ does the writeFileSync.
```

## Constraints

- Do NOT import `core/` from `templates/`. Templates must be testable without config or FS.
- Do NOT `console.log` from `core/` or `utils/`. Only commands write to stdout/stderr.
- DO NOT use `master` as the main branch, use `main`
- Do NOT use `console.error` for structured output — it is for human-facing hints only (e.g. "✓ Context scaffolded").
- On error: `console.log(JSON.stringify({ error: message }))` then `process.exit(1)`.
- All config reads go through `loadConfig(configPath)` in `src/core/config.ts`. Do not parse `ctx.yaml` directly.

## Testing

Tests create temp dirs, clean up in `afterEach`, use real FS, call functions directly.

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path'; import { tmpdir } from 'node:os';

describe('myFunction', () => {
  const tmpDirs: string[] = [];
  afterEach(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); tmpDirs.length = 0; });
  it('does the thing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctxify-test-')); tmpDirs.push(dir);
    // set up, call, assert
  });
});
```

Integration tests invoke `dist/bin/ctxify.js` via `execFileSync`. Run `npm run build` first.

## Gotchas

- `overview_updated: false` from `ctxify domain add` is normal when the entry already exists in the `domain-index` block.
- The `domain-index` segment markers must be present in `overview.md` for `ctxify domain add` to update them; if missing, it appends to `## Domains` instead.
- `auditShards` infers file type from frontmatter `type` field first. A domain file without `type: domain` is classified as `unknown` and skips size checks.
- `ctxify patterns <repo>` errors if `patterns.md` already exists. Pass `--force` to overwrite.
