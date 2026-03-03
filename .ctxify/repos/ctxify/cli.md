---
repo: ctxify
type: domain
ctxify_version: 0.7.1
domain: cli
---

# cli

The CLI is built with Commander.js. `bin/ctxify.ts` is the entry point; each command registers itself via a `register*Command(program)` function in `src/cli/commands/`. The most complex command is `init`, which has both an interactive TTY path and a flag-driven path — both converge on `scaffoldWorkspace()`.

## Concepts

**Entry point flow.** `bin/ctxify.ts` creates a single Commander `program`, registers every command via `register*Command(program)`, and calls `program.parseAsync()`. Top-level errors are caught and serialised as JSON — never thrown to the terminal as plain text.

**JSON output is a hard contract.** Every command writes JSON to stdout. Human-readable hints go to stderr. This keeps stdout pipeable for agents and scripts without parsing ambiguity.

**Interactive vs flag-driven init.** `ctxify init` has two entry paths that converge on `scaffoldWorkspace()`:
- Interactive: `process.stdin.isTTY && !hasFlags` → calls `runInteractiveFlow()` in `init-interactive.ts`
- Flag-driven: `--repos` or `--mono` present, or non-TTY stdin → builds `ScaffoldOptions` inline

Both paths produce the same `ScaffoldOptions` shape and call the same `scaffoldWorkspace()`. The split is purely about how options are collected, not about what happens next.

**`runInteractiveFlow` is separated for testability.** The interactive prompts live in `init-interactive.ts`. `resolveInteractiveOptions()` is a pure function (answers → `ScaffoldOptions`) that can be tested without spawning a TTY. The messy `@inquirer/prompts` calls are isolated from the convergence logic.

**Hook installation patches settings.json.** When `claude` agent is selected and `--no-hook` is not passed, `installClaudeHook()` reads `.claude/settings.json` (workspace or `~/.claude/settings.json` for global scope), merges a `SessionStart` entry with `ctxify context-hook` as the command, and writes it back. The merge is idempotent — any existing ctxify entry is replaced by matching `HOOK_MARKER = 'ctxify context-hook'` in the command string.

**Version-check hook runs before every command except `context-hook`.** The `preAction` hook in `bin/ctxify.ts` skips `context-hook` to avoid adding latency on every Claude session start. It also skips in `CI` or when `CTXIFY_NO_UPDATE_CHECK` is set. The check is capped at 500ms and fails silently — it should never block a command.

**Install method detection** (`detectInstallMethod`) determines whether the running binary came from a global install, a local `node_modules` install, or `npx`. The result controls the hook command string inserted into settings.json (`ctxify context-hook` vs `npx ctxify context-hook` vs `npx @benjollymore/ctxify context-hook`).

## Decisions

**Commander.js over alternatives.** Commander's `register*Command(program)` pattern lets commands live in separate files without circular imports. Each command file is self-contained — it imports only what it needs and calls `program.command(...)`. No command registry, no reflection.

**Interactive by default, flags for agents.** Human users benefit from prompts; agents and CI cannot use prompts. TTY detection (`process.stdin.isTTY`) is the gate — agents always pipe stdin or redirect it, so they always get the flag-driven path. The `--repos` / `--mono` flags exist as an explicit bypass for humans who know what they want.

**Both paths call `scaffoldWorkspace()`.** This was not always the case. Previously, init had duplicated logic across paths. Merging them into one function made behaviour consistent and let integration tests test both entry points without duplicating assertions.

**Hook merge, not replace.** `mergeHookIntoSettings` reads existing settings.json and merges only the `SessionStart` array — it does not clobber other hook types or top-level settings keys. This is critical: Claude Code settings may have user-defined hooks, MCP configs, or other fields. Replacing the file would silently delete them.

## Patterns

**Adding a new command.**
1. Create `src/cli/commands/{name}.ts` with `export function register{Name}Command(program: Command): void`
2. Import and call it in `bin/ctxify.ts`
3. Output JSON to stdout; hints to stderr

**Accessing version at runtime.** Commands that need the version read `process.env.CTXIFY_CURRENT_VERSION` (set in `bin/ctxify.ts`) or call `getCtxifyVersion()` from `src/utils/version.ts`. Do not re-parse `package.json` inside a command.

## Traps

**TTY detection is fragile in tests.** Integration tests invoke the CLI via `execFileSync`, so `process.stdin.isTTY` is `undefined` (falsy). If a test omits `--repos` or `--mono`, the flag-driven auto-detect path runs — not the interactive path. This is correct behaviour but can surprise you if you expect interactive prompts in tests.

**`--hook` / `--no-hook` are paired Commander options.** Commander parses `--no-hook` as setting `hook: false` on the options object. If you add a new boolean flag that needs a negation form, follow the same `--hook` / `--no-hook` pattern — do not use `--skip-*` naming.

**settings.json merge can silently corrupt on malformed JSON.** `mergeHookIntoSettings` catches JSON parse errors and starts from `{}`. If the user's `settings.json` is malformed (e.g. has trailing commas), the existing content is lost. The code intentionally accepts this trade-off over crashing, but agents should warn users to validate their settings file if they see unexpected data loss.

**`context-hook` is excluded from version-check on purpose.** Skipping it in `preAction` is load-bearing — the hook runs on every Claude session start. A 500ms network call on every session would be unacceptable. Do not remove the `context-hook` exclusion.
