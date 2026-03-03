import type { EvalTask, JudgeResult, PreScreenResult, SignalResult, ScoredRun } from './types.js';

// ── Pre-Screening ───────────────────────────────────────────────────────

export function preScreen(task: EvalTask, output: string): PreScreenResult {
  const signals: SignalResult[] = task.expectedSignals.map((s) => ({
    pattern: s.pattern,
    found: output.includes(s.pattern),
  }));

  const antiPatterns: SignalResult[] = task.antiPatterns.map((s) => ({
    pattern: s.pattern,
    found: output.includes(s.pattern),
  }));

  return {
    signals,
    antiPatterns,
    signalHits: signals.filter((s) => s.found).length,
    signalTotal: signals.length,
    antiPatternHits: antiPatterns.filter((s) => s.found).length,
    antiPatternTotal: antiPatterns.length,
  };
}

// ── Weighted Score ──────────────────────────────────────────────────────

export function computeWeightedScore(
  task: EvalTask,
  judgeResult: JudgeResult,
): { weightedScore: number; maxPossibleScore: number; normalizedScore: number } {
  let weightedScore = 0;
  let maxPossibleScore = 0;

  for (const criterion of task.rubric) {
    const judgeScore = judgeResult.scores.find((s) => s.criterionId === criterion.id);
    const score = judgeScore?.score ?? 0;
    weightedScore += score * criterion.weight;
    maxPossibleScore += 3 * criterion.weight;
  }

  const normalizedScore = maxPossibleScore > 0 ? weightedScore / maxPossibleScore : 0;
  return { weightedScore, maxPossibleScore, normalizedScore };
}

// ── Combine into ScoredRun ──────────────────────────────────────────────

export function buildScoredRun(
  task: EvalTask,
  judgeResult: JudgeResult,
  output: string,
  runIndex: number,
): ScoredRun {
  const preScreenResult = preScreen(task, output);
  const { weightedScore, maxPossibleScore, normalizedScore } = computeWeightedScore(
    task,
    judgeResult,
  );

  return {
    taskId: task.id,
    condition: judgeResult.condition,
    runIndex,
    judgeResult,
    preScreen: preScreenResult,
    weightedScore,
    maxPossibleScore,
    normalizedScore,
  };
}
