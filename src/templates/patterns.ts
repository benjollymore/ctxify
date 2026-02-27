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
    `<!-- TODO: Agent — route/controller structure (3-5 line example) -->\n\n` +
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
