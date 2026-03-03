import Anthropic from '@anthropic-ai/sdk';
import type { EvalTask, JudgeResult, JudgeScore, TokenUsage } from './types.js';
import { buildJudgeUserPrompt } from './prompts.js';

// ── Response Parser (exported for agent mode) ───────────────────────────

export function parseJudgeResponse(
  text: string,
  task: EvalTask,
  condition: 'baseline' | 'with-context',
  usage: TokenUsage = { inputTokens: 0, outputTokens: 0 },
): JudgeResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      taskId: task.id,
      condition,
      scores: task.rubric.map((c) => ({
        criterionId: c.id,
        score: 0,
        reasoning: 'Judge failed to produce valid JSON',
      })),
      usage,
    };
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    scores: Record<string, number>;
    reasoning: string;
  };

  const scores: JudgeScore[] = task.rubric.map((c) => ({
    criterionId: c.id,
    score: Math.min(3, Math.max(0, Math.round(parsed.scores[c.id] ?? 0))),
    reasoning: parsed.reasoning,
  }));

  return { taskId: task.id, condition, scores, usage };
}

// ── Judge (SDK mode) ────────────────────────────────────────────────────

export async function judgeOutput(
  client: Anthropic,
  task: EvalTask,
  output: string,
  condition: 'baseline' | 'with-context',
  model: string,
): Promise<JudgeResult> {
  const prompt = buildJudgeUserPrompt(task, output);

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const usage: TokenUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  return parseJudgeResponse(text, task, condition, usage);
}
