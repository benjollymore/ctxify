/**
 * Extract HTML comment segments from markdown content.
 *
 * Segments have the format:
 *   <!-- tag:attr1:attr2 -->
 *   ...content...
 *   <!-- /tag -->
 *
 * When `filter` is provided, only segments whose attribute at `filter.index`
 * matches `filter.value` are returned. By default matching is substring;
 * set `filter.exact` to require an exact match.
 */
export function extractSegments(
  content: string,
  tag: string,
  filter?: { index: number; value: string; exact?: boolean },
): string[] {
  const regex = new RegExp(
    `<!-- ${tag}((?::[^\\s>]+)*) -->([\\s\\S]*?)<!-- \\/${tag} -->`,
    'g',
  );

  const results: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const attrString = match[1]; // e.g. ":GET:/users"
    const body = match[2];

    if (filter) {
      // Split ":GET:/users" → ["GET", "/users"]
      const attrs = attrString.split(':').filter(Boolean);
      const attrValue = attrs[filter.index];
      if (attrValue === undefined) continue;

      if (filter.exact) {
        if (attrValue !== filter.value) continue;
      } else {
        if (!attrValue.includes(filter.value)) continue;
      }
    }

    results.push(body.trim());
  }

  return results;
}
