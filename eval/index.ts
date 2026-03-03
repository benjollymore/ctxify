import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { assembleFromRawDir, keyToFilenameStem } from './assembly.js';
import type {
  EvalTask,
  ScoredRun,
  TokenUsage,
  AgentPrompt,
  AgentResponse,
  AgentPhaseFile,
} from './types.js';
import { EVAL_TASKS } from './tasks.js';
import { TRPC_EVAL_TASKS } from './benchmarks/trpc/tasks.js';
import { runTask, getTaskModel } from './runner.js';
import { judgeOutput, parseJudgeResponse } from './judge.js';
import { getSystemPrompt, buildTaskUserPrompt, buildJudgeUserPrompt } from './prompts.js';
import { buildScoredRun } from './scoring.js';
import { buildEvalReport, writeJsonReport, formatMarkdownReport } from './report.js';

// ── Constants ───────────────────────────────────────────────────────────

const AGENT_DIR = resolve(import.meta.dirname, '..', 'eval-results', 'agent');

function agentPath(filename: string): string {
  return resolve(AGENT_DIR, filename);
}

function ensureAgentDir(): void {
  mkdirSync(AGENT_DIR, { recursive: true });
}

function promptKey(taskId: string, condition: string, runIndex: number): string {
  return `${taskId}:${condition}:${runIndex}`;
}

// ── Benchmark Registry ─────────────────────────────────────────────────

const BENCHMARKS: Record<string, EvalTask[]> = {
  ctxify: EVAL_TASKS,
  trpc: TRPC_EVAL_TASKS,
};

// ── CLI Args ────────────────────────────────────────────────────────────

interface CliArgs {
  mode: 'sdk' | 'agent';
  phase:
    | 'generate-prompts'
    | 'generate-judge-prompts'
    | 'assemble-tasks'
    | 'assemble-judges'
    | 'report'
    | null;
  taskFilter: string | null;
  benchmark: string;
  runsPerCondition: number;
  rawDir: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let mode: 'sdk' | 'agent' = 'sdk';
  let phase: CliArgs['phase'] = null;
  let taskFilter: string | null = null;
  let benchmark = 'ctxify';
  let rawDir: string | null = null;
  const runsPerCondition = parseInt(process.env.EVAL_RUNS || '3', 10);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1] as 'sdk' | 'agent';
      i++;
    } else if (args[i] === '--phase' && args[i + 1]) {
      phase = args[i + 1] as CliArgs['phase'];
      i++;
    } else if (args[i] === '--task' && args[i + 1]) {
      taskFilter = args[i + 1];
      i++;
    } else if (args[i] === '--benchmark' && args[i + 1]) {
      benchmark = args[i + 1];
      i++;
    } else if (args[i] === '--raw-dir' && args[i + 1]) {
      rawDir = args[i + 1];
      i++;
    }
  }

  if (!BENCHMARKS[benchmark]) {
    console.error(`Error: Unknown benchmark "${benchmark}".`);
    console.error(`Available benchmarks: ${Object.keys(BENCHMARKS).join(', ')}`);
    process.exit(1);
  }

  return { mode, phase, taskFilter, benchmark, runsPerCondition, rawDir };
}

// ── SDK Mode ────────────────────────────────────────────────────────────

async function runSdkMode(
  benchmark: string,
  taskFilter: string | null,
  runsPerCondition: number,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required for SDK mode.');
    process.exit(1);
  }

  const model = getTaskModel();
  const client = new Anthropic({ apiKey });
  const tasks = filterTasks(benchmark, taskFilter);

  console.log(
    `Running evals (SDK): benchmark=${benchmark}, ${tasks.length} task(s), ${runsPerCondition} run(s)/condition, model=${model}`,
  );
  console.log('');

  const allScoredRuns: ScoredRun[] = [];
  const allUsages: TokenUsage[] = [];

  for (const task of tasks) {
    console.log(`── ${task.id} (${task.category}) ──`);

    for (let run = 0; run < runsPerCondition; run++) {
      for (const condition of ['baseline', 'with-context'] as const) {
        const label = `  run ${run + 1}/${runsPerCondition} [${condition}]`;
        process.stdout.write(`${label}...`);

        const result = await runTask(client, task, condition, model);
        allUsages.push(result.usage);

        const judgeResult = await judgeOutput(client, task, result.output, condition, model);
        allUsages.push(judgeResult.usage);

        const scored = buildScoredRun(task, judgeResult, result.output, run);
        allScoredRuns.push(scored);

        console.log(
          ` score=${(scored.normalizedScore * 100).toFixed(1)}% (${(result.durationMs / 1000).toFixed(1)}s)`,
        );
      }
    }

    console.log('');
  }

  const report = buildEvalReport(tasks, allScoredRuns, allUsages, model, runsPerCondition);
  const jsonPath = writeJsonReport(report);
  const markdown = formatMarkdownReport(report);

  console.log(markdown);
  console.log('');
  console.log(`JSON report written to: ${jsonPath}`);
}

// ── Agent Mode: Phase 1 — Generate Task Prompts ────────────────────────

function agentGeneratePrompts(
  benchmark: string,
  taskFilter: string | null,
  runsPerCondition: number,
): void {
  const tasks = filterTasks(benchmark, taskFilter);
  ensureAgentDir();

  const prompts: AgentPrompt[] = [];

  for (const task of tasks) {
    for (let run = 0; run < runsPerCondition; run++) {
      for (const condition of ['baseline', 'with-context'] as const) {
        const key = promptKey(task.id, condition, run);
        prompts.push({
          key,
          taskId: task.id,
          condition,
          runIndex: run,
          system: getSystemPrompt(task),
          user: buildTaskUserPrompt(task, condition, key),
        });
      }
    }
  }

  // Write bulk JSON
  const file: AgentPhaseFile<AgentPrompt> = {
    phase: 'task-prompts',
    generatedAt: new Date().toISOString(),
    items: prompts,
  };

  const outPath = agentPath('task-prompts.json');
  writeFileSync(outPath, JSON.stringify(file, null, 2));

  // Write individual prompt files
  const promptsDir = agentPath('prompts');
  mkdirSync(promptsDir, { recursive: true });

  const manifest: Record<string, string> = {};
  for (const p of prompts) {
    const filename = `${keyToFilenameStem(p.key)}.md`;
    manifest[p.key] = filename;
    writeFileSync(resolve(promptsDir, filename), p.user);
  }
  writeFileSync(resolve(promptsDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`Generated ${prompts.length} task prompts.`);
  console.log(`Individual prompts: ${promptsDir}/`);
  console.log('');
  console.log(`Next: run each prompt, save outputs to ${agentPath('raw-tasks')}/`);
  console.log(`Then: npm run eval -- --mode agent --phase assemble-tasks --benchmark ${benchmark}`);
}

// ── Agent Mode: Phase 2 — Generate Judge Prompts ────────────────────────

function agentGenerateJudgePrompts(benchmark: string, taskFilter: string | null): void {
  const tasks = filterTasks(benchmark, taskFilter);
  ensureAgentDir();

  const responsesPath = agentPath('task-responses.json');
  const responsesFile = JSON.parse(
    readFileSync(responsesPath, 'utf-8'),
  ) as AgentPhaseFile<AgentResponse>;

  const responseMap = new Map(responsesFile.items.map((r) => [r.key, r.output]));

  const judgePrompts: AgentPrompt[] = [];

  for (const task of tasks) {
    for (const resp of responsesFile.items) {
      if (!resp.key.startsWith(task.id + ':')) continue;

      const [, condition, runStr] = resp.key.split(':');
      const output = responseMap.get(resp.key);
      if (!output) continue;

      judgePrompts.push({
        key: resp.key,
        taskId: task.id,
        condition: condition as 'baseline' | 'with-context',
        runIndex: parseInt(runStr, 10),
        system: '',
        user: buildJudgeUserPrompt(task, output, resp.key),
      });
    }
  }

  // Write bulk JSON
  const file: AgentPhaseFile<AgentPrompt> = {
    phase: 'judge-prompts',
    generatedAt: new Date().toISOString(),
    items: judgePrompts,
  };

  const outPath = agentPath('judge-prompts.json');
  writeFileSync(outPath, JSON.stringify(file, null, 2));

  // Write individual judge prompt files
  const splitDir = agentPath('judge-prompts-split');
  mkdirSync(splitDir, { recursive: true });

  for (const p of judgePrompts) {
    const filename = `${keyToFilenameStem(p.key)}.md`;
    writeFileSync(resolve(splitDir, filename), p.user);
  }

  console.log(`Generated ${judgePrompts.length} judge prompts.`);
  console.log(`Individual prompts: ${splitDir}/`);
  console.log('');
  console.log(`Next: run each prompt, save outputs to ${agentPath('raw-judges')}/`);
  console.log(
    `Then: npm run eval -- --mode agent --phase assemble-judges --benchmark ${benchmark}`,
  );
}

// ── Agent Mode: Assemble Tasks ──────────────────────────────────────────

function agentAssembleTasks(
  benchmark: string,
  taskFilter: string | null,
  runsPerCondition: number,
  rawDir: string | null,
): void {
  const tasks = filterTasks(benchmark, taskFilter);
  ensureAgentDir();

  const expectedKeys: string[] = [];
  for (const task of tasks) {
    for (let run = 0; run < runsPerCondition; run++) {
      for (const condition of ['baseline', 'with-context'] as const) {
        expectedKeys.push(promptKey(task.id, condition, run));
      }
    }
  }

  const dir = rawDir ?? agentPath('raw-tasks');
  const result = assembleFromRawDir(dir, expectedKeys, { extractCode: true });

  const file: AgentPhaseFile<AgentResponse> = {
    phase: 'task-responses',
    generatedAt: new Date().toISOString(),
    items: result.items,
  };

  const outPath = agentPath('task-responses.json');
  writeFileSync(outPath, JSON.stringify(file, null, 2));

  const status = `Assembled ${result.found}/${expectedKeys.length} responses`;
  if (result.missing.length > 0) {
    console.log(`${status} (${result.missing.length} missing: ${result.missing.join(', ')})`);
  } else {
    console.log(status);
  }
  console.log(`Written to: ${outPath}`);
  console.log('');
  console.log(
    `Next: npm run eval -- --mode agent --phase generate-judge-prompts --benchmark ${benchmark}`,
  );
}

// ── Agent Mode: Assemble Judges ─────────────────────────────────────────

function agentAssembleJudges(
  benchmark: string,
  taskFilter: string | null,
  runsPerCondition: number,
  rawDir: string | null,
): void {
  const tasks = filterTasks(benchmark, taskFilter);
  ensureAgentDir();

  const expectedKeys: string[] = [];
  for (const task of tasks) {
    for (let run = 0; run < runsPerCondition; run++) {
      for (const condition of ['baseline', 'with-context'] as const) {
        expectedKeys.push(promptKey(task.id, condition, run));
      }
    }
  }

  const dir = rawDir ?? agentPath('raw-judges');
  const result = assembleFromRawDir(dir, expectedKeys, { extractCode: false });

  const file: AgentPhaseFile<AgentResponse> = {
    phase: 'judge-responses',
    generatedAt: new Date().toISOString(),
    items: result.items,
  };

  const outPath = agentPath('judge-responses.json');
  writeFileSync(outPath, JSON.stringify(file, null, 2));

  const status = `Assembled ${result.found}/${expectedKeys.length} judge responses`;
  if (result.missing.length > 0) {
    console.log(`${status} (${result.missing.length} missing: ${result.missing.join(', ')})`);
  } else {
    console.log(status);
  }
  console.log(`Written to: ${outPath}`);
  console.log('');
  console.log(`Next: npm run eval -- --mode agent --phase report --benchmark ${benchmark}`);
}

// ── Agent Mode: Score and Report ────────────────────────────────────────

function agentReport(benchmark: string, taskFilter: string | null, runsPerCondition: number): void {
  const tasks = filterTasks(benchmark, taskFilter);

  const responsesFile = JSON.parse(
    readFileSync(agentPath('task-responses.json'), 'utf-8'),
  ) as AgentPhaseFile<AgentResponse>;
  const judgeResponsesFile = JSON.parse(
    readFileSync(agentPath('judge-responses.json'), 'utf-8'),
  ) as AgentPhaseFile<AgentResponse>;

  const responseMap = new Map(responsesFile.items.map((r) => [r.key, r.output]));
  const judgeMap = new Map(judgeResponsesFile.items.map((r) => [r.key, r.output]));

  const allScoredRuns: ScoredRun[] = [];

  for (const task of tasks) {
    for (const [key, judgeText] of judgeMap) {
      if (!key.startsWith(task.id + ':')) continue;

      const [, condition, runStr] = key.split(':');
      const taskOutput = responseMap.get(key) ?? '';
      const judgeResult = parseJudgeResponse(
        judgeText,
        task,
        condition as 'baseline' | 'with-context',
      );

      const scored = buildScoredRun(task, judgeResult, taskOutput, parseInt(runStr, 10));
      allScoredRuns.push(scored);
    }
  }

  const report = buildEvalReport(tasks, allScoredRuns, [], 'agent-mode', runsPerCondition);
  const jsonPath = writeJsonReport(report);
  const markdown = formatMarkdownReport(report);

  console.log(markdown);
  console.log('');
  console.log(`JSON report written to: ${jsonPath}`);
}

// ── Shared ──────────────────────────────────────────────────────────────

function filterTasks(benchmark: string, taskFilter: string | null) {
  const allTasks = BENCHMARKS[benchmark]!;
  const tasks = taskFilter ? allTasks.filter((t) => t.id === taskFilter) : allTasks;

  if (tasks.length === 0) {
    console.error(`Error: No task found matching "${taskFilter}" in benchmark "${benchmark}".`);
    console.error(`Available tasks: ${allTasks.map((t) => t.id).join(', ')}`);
    process.exit(1);
  }

  return tasks;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { mode, phase, taskFilter, benchmark, runsPerCondition, rawDir } = parseArgs();

  if (mode === 'sdk') {
    await runSdkMode(benchmark, taskFilter, runsPerCondition);
    return;
  }

  // Agent mode
  if (!phase) {
    console.error('Error: --phase is required in agent mode.');
    console.error(
      'Phases: generate-prompts, assemble-tasks, generate-judge-prompts, assemble-judges, report',
    );
    process.exit(1);
  }

  switch (phase) {
    case 'generate-prompts':
      agentGeneratePrompts(benchmark, taskFilter, runsPerCondition);
      break;
    case 'assemble-tasks':
      agentAssembleTasks(benchmark, taskFilter, runsPerCondition, rawDir);
      break;
    case 'generate-judge-prompts':
      agentGenerateJudgePrompts(benchmark, taskFilter);
      break;
    case 'assemble-judges':
      agentAssembleJudges(benchmark, taskFilter, runsPerCondition, rawDir);
      break;
    case 'report':
      agentReport(benchmark, taskFilter, runsPerCondition);
      break;
  }
}

main().catch((err) => {
  console.error('Eval failed:', err);
  process.exit(1);
});
