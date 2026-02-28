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
    `<!-- TODO: Agent — how a new feature gets wired up end-to-end. Show the pattern, not every route. -->\n\n` +
    `## Validation\n\n` +
    `<!-- TODO: Agent — validation approach (2-3 line example) -->\n\n` +
    `## Testing\n\n` +
    `<!-- TODO: Agent — how tests are written (brief example) -->\n\n` +
    `## Naming Conventions\n\n` +
    `<!-- TODO: Agent — naming conventions -->\n\n` +
    `## Gotchas\n\n` +
    `<!-- TODO: Agent — traps and non-obvious patterns -->\n`
  );
}
