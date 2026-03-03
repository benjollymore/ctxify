import Anthropic from '@anthropic-ai/sdk';
import type { EvalTask, RunResult } from './types.js';
import { getSystemPrompt, buildTaskUserPrompt } from './prompts.js';

// ── Config ──────────────────────────────────────────────────────────────

export function getTaskModel(): string {
  return process.env.EVAL_MODEL || 'claude-sonnet-4-20250514';
}

// ── Runner ──────────────────────────────────────────────────────────────

export async function runTask(
  client: Anthropic,
  task: EvalTask,
  condition: 'baseline' | 'with-context',
  model: string,
): Promise<RunResult> {
  const userContent = buildTaskUserPrompt(task, condition);
  const start = performance.now();

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0.3,
    system: getSystemPrompt(task),
    messages: [{ role: 'user', content: userContent }],
  });

  const durationMs = performance.now() - start;

  const output = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return {
    taskId: task.id,
    condition,
    output,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    durationMs,
  };
}
