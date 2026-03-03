---
repo: ctxify
type: domain
ctxify_version: 0.7.1
domain: eval-harness
---

# eval-harness

The eval system measures whether ctxify context actually helps agents write better code. It runs tasks in two conditions — `baseline` (source files only) and `with-context` (source files + `.ctxify/` shards) — then uses a judge LLM to score the output against rubric criteria, and reports the delta.

## Concepts

- **Task** (`EvalTask`): A coding prompt with `sourceFiles`, optional `contextFiles`, a `rubric` (weighted criteria, 0-3 scale), `expectedSignals` (regex patterns that should appear), and `antiPatterns` (patterns that should not).
- **Condition**: `baseline` vs `with-context`. Same prompt, different context injected. The delta between conditions is the signal.
- **Judge**: A second LLM call that scores the task output against rubric criteria. Scores 0-3 per criterion, then weighted-averaged into a `normalizedScore` (0-1).
- **Pre-screen**: Regex signal/anti-pattern checks run before the judge. They don't affect scoring but flag obvious failures.
- **Benchmark**: A named collection of tasks (`ctxify` or `trpc`). Registered in `eval/index.ts` `BENCHMARKS` map.

## Two Run Modes

**SDK mode** (default): Calls Anthropic API directly for both task and judge. Runs tasks, judges, and reports in one pass. Requires `ANTHROPIC_API_KEY`.

```bash
npm run eval                          # default: ctxify benchmark, 3 runs/condition
EVAL_RUNS=5 npm run eval -- --task add-stats-command
```

**Agent mode**: A multi-phase pipeline for using an external agent (e.g. Claude Code) as the task runner. The judge can still run via SDK.

```
Phase 1: --mode agent --phase generate-prompts   → eval-results/agent/prompts/
Phase 2: (manually run each prompt, save outputs to eval-results/agent/raw-tasks/)
Phase 3: --mode agent --phase assemble-tasks
Phase 4: --mode agent --phase generate-judge-prompts
Phase 5: (run judge prompts, save to eval-results/agent/raw-judges/)
Phase 6: --mode agent --phase assemble-judges
Phase 7: --mode agent --phase report
```

Keys follow `{taskId}:{condition}:{runIndex}` format throughout the pipeline.

## Adding a Task

- Add an `EvalTask` object to `eval/tasks.ts` (for ctxify) or the benchmark file.
- Set `sourceFiles` to paths the agent would naturally open (relative to workspace root).
- Weight rubric criteria by importance: file placement and registration patterns at 1.5-2.0, style details at 0.5-1.0.

```typescript
// eval/tasks.ts
{
  id: 'my-new-task',
  category: 'new-command',
  prompt: `Add a command that does X...`,
  sourceFiles: ['bin/ctxify.ts', 'src/cli/commands/status.ts'],
  contextFiles: ['.ctxify/repos/ctxify/overview.md', '.ctxify/repos/ctxify/patterns.md'],
  rubric: [
    { id: 'file-placement', description: 'Handler in src/cli/commands/', weight: 1.5 },
    { id: 'json-output', description: 'Uses JSON.stringify to stdout', weight: 2.0 },
  ],
  expectedSignals: [{ pattern: 'registerMyCommand', description: 'exports register function' }],
  antiPatterns: [{ pattern: 'console\\.error.*JSON', description: 'errors to stderr not stdout' }],
}
```

## Traps

- The `contextFiles` field in `EvalTask` is the list injected for `with-context` runs. If you forget to include `patterns.md`, the test measures an unfair baseline — the agent won't know the canonical patterns.
- `eval/` is not built by `npm run build` — it runs directly via `tsx` (`npm run eval`). Do not import from `eval/` in `src/` or `bin/`.
- Agent mode file naming: prompt files use `keyToFilenameStem(key)` which replaces `:` with `--`. Raw output files must match that naming or `assembleFromRawDir` will report them as missing.
- `runsPerCondition` defaults to 3 (from `EVAL_RUNS` env var). Changing it mid-run in agent mode causes key mismatches between phases — set it once and keep it fixed across all phases.
