import type { Renderer } from './types.js';
import { heading, table, yamlFrontmatter } from '../utils/markdown.js';

export const sharedTypesMdRenderer: Renderer = {
  outputPath: '.ctx/shared-types.md',

  render(ctx) {
    const lines: string[] = [];

    lines.push(yamlFrontmatter({
      generated_by: 'ctxify',
      last_scanned: ctx.metadata.generatedAt,
    }));
    lines.push('');

    lines.push(heading(1, 'Shared Types'));
    lines.push('');

    if (ctx.sharedTypes.length === 0) {
      lines.push('No shared types detected across repos.');
      return lines.join('\n');
    }

    lines.push(table(
      ['Name', 'Kind', 'Defined In', 'File', 'Used By'],
      ctx.sharedTypes.map((t) => [
        `\`${t.name}\``,
        t.kind,
        t.definedIn,
        t.file,
        t.usedBy.join(', '),
      ]),
    ));
    lines.push('');

    return lines.join('\n');
  },
};
