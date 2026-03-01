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
    `<!-- TODO: Agent — document the patterns that aren't obvious from reading one file.\n` +
    `Start with how a new feature gets wired up end-to-end (the primary deliverable).\n` +
    `Then add sections as applicable: testing patterns, validation approach, naming conventions, gotchas.\n` +
    `Use bullet points and short code examples over prose. Skip sections that don't apply.\n` +
    `20-50 lines total. -->\n`
  );
}
