import type { EvalTask } from './types.js';
import { wrapSourceFile, wrapContextFile } from './helpers.js';

// ── System Prompt ───────────────────────────────────────────────────────

export const TASK_SYSTEM_PROMPT = `You are an expert TypeScript developer working on ctxify, an npm CLI and library that scaffolds persistent context for AI coding agents. The codebase uses ESM-only TypeScript with strict mode, Commander.js for CLI, vitest for testing, and follows specific conventions for file placement, output format, and code style. Write production-quality code.`;

export function getSystemPrompt(task: EvalTask): string {
  return task.systemPrompt ?? TASK_SYSTEM_PROMPT;
}

// ── Task Prompt ─────────────────────────────────────────────────────────

export function buildTaskUserPrompt(
  task: EvalTask,
  condition: 'baseline' | 'with-context',
  key?: string,
): string {
  const keyMarker = key ? `<!-- eval-key: ${key} -->\n\n` : '';
  const sourceBlock = task.sourceFiles.map(wrapSourceFile).join('\n\n');

  if (condition === 'with-context') {
    const contextBlock = task.contextFiles.map(wrapContextFile).join('\n\n');
    return `${keyMarker}Here are the project's context files that describe architecture, patterns, and conventions:\n\n${contextBlock}\n\nHere are the relevant source files:\n\n${sourceBlock}\n\n${task.prompt}`;
  }

  return `${keyMarker}Here are the relevant source files:\n\n${sourceBlock}\n\n${task.prompt}`;
}

// ── Judge Prompt ────────────────────────────────────────────────────────

export function buildJudgeUserPrompt(task: EvalTask, output: string, key?: string): string {
  const criteriaList = task.rubric
    .map((c) => `- **${c.id}** (weight: ${c.weight}): ${c.description}`)
    .join('\n');

  const keyMarker = key ? `<!-- eval-key: ${key} -->\n\n` : '';

  return `${keyMarker}You are evaluating code output from an AI coding assistant. Score each criterion on a 0-3 scale.

## Scoring anchors
- **0** — Wrong or missing. The criterion is not met at all.
- **1** — Major issues. Attempted but with significant problems.
- **2** — Minor issues. Mostly correct with small deviations.
- **3** — Perfect. Fully meets the criterion.

## Task
${task.prompt}

## Criteria
${criteriaList}

## Agent Output
<agent_output>
${output}
</agent_output>

## Instructions
Score each criterion. Respond with ONLY a JSON object in this exact format:
{
  "scores": {
    "${task.rubric.map((c) => c.id).join('": <0-3>,\n    "')}"
  },
  "reasoning": "Brief overall assessment (2-3 sentences)"
}

Do not include any text outside the JSON object.`;
}
