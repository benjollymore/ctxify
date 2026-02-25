export function heading(level: number, text: string): string {
  return `${'#'.repeat(level)} ${text}`;
}

export function codeBlock(content: string, lang = ''): string {
  return `\`\`\`${lang}\n${content}\n\`\`\``;
}

export function table(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyRows = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${headerRow}\n${separatorRow}\n${bodyRows}`;
}

export function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

export function yamlFrontmatter(data: Record<string, unknown>): string {
  const lines = Object.entries(data).map(([key, value]) => `${key}: ${formatFrontmatterValue(value)}`);
  return `---\n${lines.join('\n')}\n---`;
}

function formatFrontmatterValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.map(formatFrontmatterValue).join(', ')}]`;
  return JSON.stringify(value);
}
