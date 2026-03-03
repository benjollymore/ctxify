import { dumpYaml } from '../utils/yaml.js';

// ── Types ────────────────────────────────────────────────────────────────

interface PatternsTemplateData {
  repo: string;
}

// ── Generator ────────────────────────────────────────────────────────────

export function generatePatternsTemplate(data: PatternsTemplateData): string {
  const fm = dumpYaml({ repo: data.repo, type: 'patterns' });
  return (
    `---\n${fm.trimEnd()}\n---\n\n` +
    `# How to Build Features\n\n` +
    `How we build features here — the patterns and conventions that aren't obvious from reading one file.\n\n` +
    `<!-- TODO: Agent — fill the sections below. Skip sections that don't apply. 20-50 lines total.\n\n` +
    `## Adding a Feature\n` +
    `Where new features get wired in, in order. Show a 3-5 line code example of the canonical pattern.\n\n` +
    `## Constraints\n` +
    `What NOT to do. Import restrictions, ordering requirements, builder chain rules, forbidden patterns.\n` +
    `Each constraint: one bullet with the rule, then why it matters.\n\n` +
    `## Testing\n` +
    `How tests are structured: helpers, fixtures, assertion patterns.\n` +
    `Show a brief code example of the idiomatic test shape.\n\n` +
    `## Gotchas\n` +
    `Things that look right but break. Brief bullets only. -->\n`
  );
}
