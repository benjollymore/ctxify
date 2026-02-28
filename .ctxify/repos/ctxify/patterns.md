---
repo: ctxify
type: patterns
---

# How to Build Features

## Adding a CLI Command

1. Create `src/cli/commands/{name}.ts` exporting `register{Name}Command(program: Command)`
2. Register it in `bin/ctxify.ts` alongside the other imports
3. Commands always output JSON to stdout (`console.log(JSON.stringify(result, null, 2))`)
4. Errors also output JSON with an `error` field, then `process.exit(1)`

```typescript
export function registerFooCommand(program: Command): void {
  program
    .command('foo <required-arg>')
    .description('...')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (arg: string, options: { dir?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');
      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run "ctxify init" first.' }));
        process.exit(1);
      }
      const config = loadConfig(configPath);
      // ... do work ...
      console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
    });
}
```

## Validation

- Config is validated in `loadConfig()` (`src/core/config.ts`) — throws `ConfigError` with message
- CLI commands validate repo name against `config.repos.find(r => r.name === name)`
- Domain names validated with `/^[a-z0-9]+(-[a-z0-9]+)*$/` before file creation
- Always check `existsSync(configPath)` before `loadConfig()` and emit JSON error if missing

## Testing

Every test creates its own temp dir — never share state between tests:

```typescript
describe('my command', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('does the thing', () => {
    // write ctx.yaml + .ctxify/ structure using serializeConfig + generateRepoTemplate
    const out = execFileSync(CLI_BIN, ['foo', '--dir', tmpDir], { encoding: 'utf-8' });
    const result = JSON.parse(out);
    expect(result.status).toBe('ok');
  });
});
```

Integration tests use `execFileSync` on `dist/bin/ctxify.js`. Unit tests call functions directly. Run a single file: `npx vitest run test/unit/foo.test.ts`.

## Naming Conventions

- Command files: `src/cli/commands/{verb}.ts` (e.g., `domain.ts`, `patterns.ts`)
- Template functions: `generate{Thing}Template(data: {Thing}TemplateData): string`
- Core functions: descriptive verbs — `loadConfig`, `validateShards`, `parseRepoManifest`
- Types in `config.ts` are the canonical source for config shapes; import from there
- Test helpers: `makeTmpDir()`, `createWorkspace()` — keep local to test file

## Gotchas

- **Build before testing CLI changes**: integration tests run `dist/bin/ctxify.js`. Run `npm run build` first.
- **`ctx.yaml` `skills` is `Record<string, SkillEntry>`** where `SkillEntry = { path: string; scope: 'workspace' | 'global' }`. The value is an object, not a string. Old v0.x configs used strings — `loadConfig` will throw `ConfigError` if the shape is wrong.
- **`outputDir` from config** — always use `config.options.outputDir || '.ctxify'`; never hardcode `.ctxify` in command handlers.
- **Template functions are pure**: no file I/O. The calling command handler does all writes. Don't add side effects to template functions.
- **`ctxify validate` exits 1 on TODO** — unfilled TODO markers in shard files cause validate to fail. This is intentional — the workflow expects agents to fill them.
