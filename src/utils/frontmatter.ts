import { parseYaml } from './yaml.js';

/**
 * Extract YAML frontmatter from a markdown string.
 * Frontmatter is delimited by `---` on its own line at the start of the file.
 */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return parseYaml<Record<string, unknown>>(match[1]);
  } catch {
    return null;
  }
}
