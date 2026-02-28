---
repo: ctxify
type: domain
domain: cli-commands
---

# cli-commands

11 Commander.js commands registered in bin/ctxify.ts via command handler imports. Each command lives in src/cli/commands/{name}.ts and exports register${Name}Command(program). All commands load ctx.yaml, validate repo existence, perform action, output JSON to stdout. Errors output JSON with error field and exit(1).

## Concepts

**11 commands**: init, status, validate, patterns, domain (add/list), feedback, upgrade, clean, branch, commit, context-hook. **Command handler pattern**: each in src/cli/commands/{name}.ts exports `registerXyzCommand(program: Command)` function. Handler uses program.command().option().action() to register CLI behavior. **Config loading**: most commands load ctx.yaml via `loadConfig()`, validate repo existence, operate on `.ctxify/repos/{repo}/`. **JSON output**: every command outputs JSON to stdout. Result objects contain status, metadata, paths. Errors output `{ error: string }` and exit(1). **Options**: common options are `-d/--dir` (workspace root, defaults to '.'), `--force` (overwrite), `--repo` (filter repos). **Error propagation**: ConfigError, GitError extend CtxifyError and are caught in bin/ctxify.ts preAction hook, output as JSON error, exit(1).

## Decisions

**One file per command.** Each command is isolated, testable, easy to find and modify. Separation enables parallel development. **JSON output for agents.** Agents need parseable results, not human-friendly text. JSON allows structured error handling and result inspection. **Config-driven over arg-driven.** Commands read ctx.yaml (built by init) rather than parsing many CLI flags. Reduces CLI surface and keeps source of truth in one file. **Repo validation in every command.** Each command validates that named repo exists in ctx.yaml before proceeding. Prevents typos and gives clear error messages. **Commander.js over yargs/oclif.** Commander is lightweight, no magic, easy to reason about. action() callback gets typable options object.

## Patterns

**Command registration pattern**: `export function registerFooCommand(program: Command): void { program.command('foo <repo>').description('...').option('-d, --dir <path>').action(async (repo, options) => { ... }) }` called in bin/ctxify.ts. **Config load pattern**: `const workspaceRoot = resolve(options.dir || '.'); const config = loadConfig(join(workspaceRoot, 'ctx.yaml'));`. **Repo validation pattern**: `const repoEntry = config.repos.find(r => r.name === repo); if (!repoEntry) { console.log(JSON.stringify({ error: '...' })); process.exit(1); }`. **Output pattern**: `console.log(JSON.stringify(result, null, 2));` at end of action. **Template invocation**: commands call template generators (e.g., `generatePatternsTemplate()`) to get markdown string, then writeFileSync. Templates take typed data, return strings.

## Cross-repo

Commands like `ctxify branch <name>` and `ctxify commit <msg>` (multi-repo only) operate on all repos listed in ctx.yaml. Branch command creates git branches across all repos; commit command commits changes in all repos. Both require mode === 'multi-repo'. Other commands (patterns, domain, feedback) are per-repo and take `<repo>` as required argument.
