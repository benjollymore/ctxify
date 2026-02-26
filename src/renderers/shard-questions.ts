import type { Renderer } from './types.js';
import { dumpYaml } from '../utils/yaml.js';

export const shardQuestionsRenderer: Renderer = {
  outputPath: '.ctxify/questions/pending.yaml',

  render(ctx) {
    const unanswered = ctx.questions.filter((q) => !ctx.answers[q.id]);

    const data = {
      pending: unanswered.length,
      questions: unanswered.map((q) => ({
        id: q.id,
        pass: q.pass,
        category: q.category,
        question: q.question,
        context: q.context,
        confidence: q.confidence,
      })),
    };

    return dumpYaml(data);
  },
};
