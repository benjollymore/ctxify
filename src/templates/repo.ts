import { dumpYaml } from '../utils/yaml.js';
import type { RepoTemplateData } from './index-md.js';

// ── Noise patterns to filter from key dirs ──────────────────────────────

const NOISE_DIR_PATTERNS = [
  'patches',
  'tests',
  '__tests__',
  'test',
  '__test__',
  'fixtures',
  '__fixtures__',
  '__mocks__',
  'mocks',
  '__snapshots__',
  'coverage',
  '.cache',
];

function filterKeyDirs(dirs: string[]): string[] {
  return dirs.filter((d) => {
    // Only keep dirs with ≤2 path segments (e.g. "src/services" but not "src/services/dropoff")
    const segments = d.split('/');
    if (segments.length > 2) return false;

    // Skip if any segment matches a noise pattern
    if (segments.some((s) => NOISE_DIR_PATTERNS.includes(s))) return false;

    return true;
  });
}

// ── Generator ────────────────────────────────────────────────────────────

export function generateRepoTemplate(repo: RepoTemplateData): string {
  // ── Frontmatter ──
  const fm = dumpYaml({
    repo: repo.name,
    type: 'overview',
    language: repo.language || undefined,
    framework: repo.framework || undefined,
  });

  // ── Curated key dirs ──
  const filteredDirs = filterKeyDirs(repo.keyDirs);
  const dirLines =
    filteredDirs
      .map((d) => `- \`${d}/\` — <!-- TODO: what's this for and why it's organized this way -->`)
      .join('\n') || '- (none detected)';

  return `---
${fm.trimEnd()}
---

# ${repo.name}

<!-- TODO: Agent — what this repo does, its role in the system, who/what consumes it. 1 paragraph. -->

## Architecture

${dirLines}

<!-- TODO: Agent — describe how a request flows through this system and why it's layered this way. What would surprise someone coming from a different codebase? 10-20 lines. -->

## Context

After reading the codebase, create these sibling files in this directory:

**\`patterns.md\`** — How to build features in this repo. The most important file.
Include: end-to-end feature patterns, validation approach, testing patterns, naming
conventions, gotchas and tips. 20-50 lines with brief code examples.

**\`corrections.md\`** — Agent-logged factual corrections (created by \`ctxify feedback\`).
Always loaded — prevents repeating past mistakes.

**\`rules.md\`** — Behavioral instructions and anti-patterns (created by \`ctxify feedback --type rule\`).
Always loaded — the highest-signal context.

**Domain files** — One \`{domain}.md\` per complex domain area (3-5 domains).
Each covers: key concepts, business rules, decisions, domain-specific patterns,
cross-repo interactions. 50-150 lines each.

<!-- domain-index -->
<!-- TODO: Agent — List the domains you'll document after exploring the codebase:
- \`{domain}.md\` — {what it covers}
-->
<!-- /domain-index -->
`;
}
