// ── Rubric & Signals ────────────────────────────────────────────────────

export interface RubricCriterion {
  id: string;
  description: string;
  weight: number;
}

export interface SignalCheck {
  pattern: string;
  description: string;
}

// ── Task Definition ─────────────────────────────────────────────────────

export interface EvalTask {
  id: string;
  category: string;
  prompt: string;
  sourceFiles: string[];
  contextFiles: string[];
  rubric: RubricCriterion[];
  expectedSignals: SignalCheck[];
  antiPatterns: SignalCheck[];
  systemPrompt?: string;
}

// ── Run Results ─────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface RunResult {
  taskId: string;
  condition: 'baseline' | 'with-context';
  output: string;
  usage: TokenUsage;
  durationMs: number;
}

export interface JudgeScore {
  criterionId: string;
  score: number; // 0-3
  reasoning: string;
}

export interface JudgeResult {
  taskId: string;
  condition: 'baseline' | 'with-context';
  scores: JudgeScore[];
  usage: TokenUsage;
}

export interface SignalResult {
  pattern: string;
  found: boolean;
}

export interface PreScreenResult {
  signals: SignalResult[];
  antiPatterns: SignalResult[];
  signalHits: number;
  signalTotal: number;
  antiPatternHits: number;
  antiPatternTotal: number;
}

// ── Scored Output ───────────────────────────────────────────────────────

export interface ScoredRun {
  taskId: string;
  condition: 'baseline' | 'with-context';
  runIndex: number;
  judgeResult: JudgeResult;
  preScreen: PreScreenResult;
  weightedScore: number;
  maxPossibleScore: number;
  normalizedScore: number; // 0-1
}

// ── Agent Mode Interchange ──────────────────────────────────────────────

export interface AgentPrompt {
  key: string; // "{taskId}:{condition}:{runIndex}"
  taskId: string;
  condition: 'baseline' | 'with-context';
  runIndex: number;
  system: string;
  user: string;
}

export interface AgentResponse {
  key: string;
  output: string;
}

export interface AgentPhaseFile<T> {
  phase: string;
  generatedAt: string;
  items: T[];
}

// ── Report ──────────────────────────────────────────────────────────────

export interface CriterionDelta {
  criterionId: string;
  weight: number;
  baselineMean: number;
  contextMean: number;
  delta: number;
}

export interface TaskReport {
  taskId: string;
  category: string;
  baselineScores: number[];
  contextScores: number[];
  baselineMean: number;
  contextMean: number;
  delta: number;
  pValue: number | null;
  significant: boolean;
  criterionDeltas: CriterionDelta[];
}

export interface CostSummary {
  taskCalls: number;
  judgeCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
}

export interface EvalReport {
  timestamp: string;
  model: string;
  runsPerCondition: number;
  tasks: TaskReport[];
  aggregateDelta: number;
  cost: CostSummary;
}
