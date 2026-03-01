import { parseYaml } from './yaml.js';
import { dumpYaml } from './yaml.js';

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

/**
 * Replace YAML frontmatter in a markdown string while preserving the body.
 * If the content has no frontmatter, prepends it.
 */
export function replaceFrontmatter(
  content: string,
  newFrontmatter: Record<string, unknown>,
): string {
  const yaml = dumpYaml(newFrontmatter).trimEnd();
  const fmBlock = `---\n${yaml}\n---`;

  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (match) {
    return content.slice(0, match.index!) + fmBlock + content.slice(match.index! + match[0].length);
  }

  // No existing frontmatter — prepend
  return fmBlock + '\n\n' + content;
}
