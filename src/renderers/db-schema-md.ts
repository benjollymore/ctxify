import type { Renderer } from './types.js';
import { heading, table, yamlFrontmatter } from '../utils/markdown.js';

export const dbSchemaMdRenderer: Renderer = {
  outputPath: '.ctx/db-schema.md',

  render(ctx) {
    const lines: string[] = [];

    lines.push(yamlFrontmatter({
      generated_by: 'ctxify',
      last_scanned: ctx.metadata.generatedAt,
    }));
    lines.push('');

    lines.push(heading(1, 'Database Schema'));
    lines.push('');

    if (ctx.dbSchemas.length === 0) {
      lines.push('No database schemas detected.');
      return lines.join('\n');
    }

    for (const schema of ctx.dbSchemas) {
      lines.push(heading(2, `${schema.repo} (${schema.orm})`));
      lines.push('');
      lines.push(`Source: \`${schema.file}\``);
      lines.push('');

      for (const model of schema.models) {
        lines.push(heading(3, model.name));
        lines.push('');

        if (model.fields.length > 0) {
          lines.push(table(
            ['Field', 'Type'],
            model.fields.map((f) => [f.name, f.type]),
          ));
          lines.push('');
        }

        if (model.relations && model.relations.length > 0) {
          lines.push('**Relations:**');
          lines.push('');
          lines.push(table(
            ['Name', 'Target', 'Type'],
            model.relations.map((r) => [r.name, r.target, r.type]),
          ));
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  },
};
