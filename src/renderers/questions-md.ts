import type { Renderer } from './types.js';
import { heading, yamlFrontmatter } from '../utils/markdown.js';

export const questionsMdRenderer: Renderer = {
  outputPath: '.ctx/questions.md',

  render(ctx) {
    const lines: string[] = [];

    // Filter out questions that have been answered
    const unanswered = ctx.questions.filter((q) => !ctx.answers[q.id]);

    lines.push(yamlFrontmatter({
      generated_by: 'ctxify',
      pending: unanswered.length,
    }));
    lines.push('');

    lines.push(heading(1, 'Questions'));
    lines.push('');

    if (unanswered.length === 0) {
      lines.push('No open questions. All ambiguities resolved.');
      return lines.join('\n');
    }

    lines.push(`> ${unanswered.length} questions need clarification. Add answers to \`.ctx/answers.yaml\` and re-run with \`--with-answers\`.`);
    lines.push('');

    for (let i = 0; i < unanswered.length; i++) {
      const q = unanswered[i];
      lines.push(heading(2, `Q${i + 1}: ${q.question}`));
      lines.push('');
      lines.push(q.context);
      lines.push('');
      lines.push(`*Category: ${q.category} | Pass: ${q.pass} | Confidence: ${(q.confidence * 100).toFixed(0)}% | ID: \`${q.id}\`*`);
      lines.push('');
    }

    return lines.join('\n');
  },
};
