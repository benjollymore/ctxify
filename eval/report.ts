import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  EvalTask,
  ScoredRun,
  TaskReport,
  EvalReport,
  CriterionDelta,
  CostSummary,
  TokenUsage,
} from './types.js';
import { welchTTest } from './stats.js';
import { estimateCost, sumUsage } from './helpers.js';

// ── Per-Task Report ─────────────────────────────────────────────────────

function buildCriterionDeltas(
  task: EvalTask,
  baselineRuns: ScoredRun[],
  contextRuns: ScoredRun[],
): CriterionDelta[] {
  return task.rubric.map((criterion) => {
    const baselineScores = baselineRuns.map(
      (r) => r.judgeResult.scores.find((s) => s.criterionId === criterion.id)?.score ?? 0,
    );
    const contextScores = contextRuns.map(
      (r) => r.judgeResult.scores.find((s) => s.criterionId === criterion.id)?.score ?? 0,
    );

    const baselineMean = mean(baselineScores);
    const contextMean = mean(contextScores);

    return {
      criterionId: criterion.id,
      weight: criterion.weight,
      baselineMean,
      contextMean,
      delta: contextMean - baselineMean,
    };
  });
}

export function buildTaskReport(task: EvalTask, scoredRuns: ScoredRun[]): TaskReport {
  const baselineRuns = scoredRuns.filter((r) => r.condition === 'baseline');
  const contextRuns = scoredRuns.filter((r) => r.condition === 'with-context');

  const baselineScores = baselineRuns.map((r) => r.normalizedScore);
  const contextScores = contextRuns.map((r) => r.normalizedScore);

  const baselineMean = mean(baselineScores);
  const contextMean = mean(contextScores);
  const delta = contextMean - baselineMean;
  const pValue = welchTTest(contextScores, baselineScores);

  return {
    taskId: task.id,
    category: task.category,
    baselineScores,
    contextScores,
    baselineMean,
    contextMean,
    delta,
    pValue,
    significant: pValue !== null && pValue < 0.05,
    criterionDeltas: buildCriterionDeltas(task, baselineRuns, contextRuns),
  };
}

// ── Full Report ─────────────────────────────────────────────────────────

export function buildEvalReport(
  tasks: EvalTask[],
  allScoredRuns: ScoredRun[],
  allUsages: TokenUsage[],
  model: string,
  runsPerCondition: number,
): EvalReport {
  const taskReports = tasks.map((task) => {
    const taskRuns = allScoredRuns.filter((r) => r.taskId === task.id);
    return buildTaskReport(task, taskRuns);
  });

  const aggregateDelta =
    taskReports.length > 0
      ? taskReports.reduce((sum, t) => sum + t.delta, 0) / taskReports.length
      : 0;

  const totalUsage = sumUsage(allUsages);
  const cost: CostSummary = {
    taskCalls: tasks.length * runsPerCondition * 2,
    judgeCalls: tasks.length * runsPerCondition * 2,
    totalInputTokens: totalUsage.inputTokens,
    totalOutputTokens: totalUsage.outputTokens,
    estimatedCost: estimateCost(totalUsage, model),
  };

  return {
    timestamp: new Date().toISOString(),
    model,
    runsPerCondition,
    tasks: taskReports,
    aggregateDelta,
    cost,
  };
}

// ── Output ──────────────────────────────────────────────────────────────

export function writeJsonReport(report: EvalReport): string {
  const dir = resolve(import.meta.dirname, '..', 'eval-results');
  mkdirSync(dir, { recursive: true });

  const filename = `${report.timestamp.replace(/[:.]/g, '-')}.json`;
  const filepath = resolve(dir, filename);
  writeFileSync(filepath, JSON.stringify(report, null, 2));
  return filepath;
}

export function formatMarkdownReport(report: EvalReport): string {
  const lines: string[] = [];

  lines.push(`# Eval Report — ${report.timestamp}`);
  lines.push('');
  lines.push(
    `**Model:** ${report.model} | **Runs/condition:** ${report.runsPerCondition} | **Cost:** $${report.cost.estimatedCost.toFixed(2)}`,
  );
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Task | Category | Baseline | Context | Delta | p-value | Sig? |');
  lines.push('|------|----------|----------|---------|-------|---------|------|');

  for (const task of report.tasks) {
    const pStr = task.pValue !== null ? task.pValue.toFixed(3) : 'n/a';
    const sig = task.significant ? 'YES' : '';
    lines.push(
      `| ${task.taskId} | ${task.category} | ${(task.baselineMean * 100).toFixed(1)}% | ${(task.contextMean * 100).toFixed(1)}% | ${(task.delta * 100).toFixed(1)}pp | ${pStr} | ${sig} |`,
    );
  }

  lines.push('');
  lines.push(`**Aggregate delta:** ${(report.aggregateDelta * 100).toFixed(1)} percentage points`);
  lines.push('');

  // Per-task criterion breakdown
  lines.push('## Per-Criterion Breakdown');
  lines.push('');

  for (const task of report.tasks) {
    lines.push(`### ${task.taskId}`);
    lines.push('');
    lines.push('| Criterion | Weight | Baseline | Context | Delta |');
    lines.push('|-----------|--------|----------|---------|-------|');

    for (const cd of task.criterionDeltas) {
      const deltaStr = cd.delta > 0 ? `+${cd.delta.toFixed(2)}` : cd.delta.toFixed(2);
      lines.push(
        `| ${cd.criterionId} | ${cd.weight} | ${cd.baselineMean.toFixed(2)} | ${cd.contextMean.toFixed(2)} | ${deltaStr} |`,
      );
    }

    lines.push('');
  }

  // Cost
  lines.push('## Cost');
  lines.push('');
  lines.push(`- Task API calls: ${report.cost.taskCalls}`);
  lines.push(`- Judge API calls: ${report.cost.judgeCalls}`);
  lines.push(`- Total input tokens: ${report.cost.totalInputTokens.toLocaleString()}`);
  lines.push(`- Total output tokens: ${report.cost.totalOutputTokens.toLocaleString()}`);
  lines.push(`- Estimated cost: $${report.cost.estimatedCost.toFixed(2)}`);

  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
