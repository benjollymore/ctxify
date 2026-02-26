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

// ── Essential script patterns ───────────────────────────────────────────

const ESSENTIAL_SCRIPT_PATTERNS = [
  /^test$/,
  /^test:/,
  /^build$/,
  /^start$/,
  /^dev$/,
  /^lint$/,
  /^typecheck$/,
  /^type-check$/,
];

export function filterEssentialScripts(scripts: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, cmd] of Object.entries(scripts)) {
    if (ESSENTIAL_SCRIPT_PATTERNS.some((p) => p.test(name))) {
      result[name] = cmd;
    }
  }
  return result;
}

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
  const entryList = repo.entryPoints.map((e) => `\`${e}\``).join(', ') || 'none detected';

  // ── Frontmatter ──
  const fm = dumpYaml({
    repo: repo.name,
    type: 'overview',
    language: repo.language || undefined,
    framework: repo.framework || undefined,
    entry_points: repo.entryPoints.length > 0 ? repo.entryPoints : undefined,
    file_count: repo.fileCount,
  });

  // ── Curated key dirs ──
  const filteredDirs = filterKeyDirs(repo.keyDirs);
  const dirLines =
    filteredDirs.map((d) => `- \`${d}/\` — <!-- TODO: what's here -->`).join('\n') ||
    '- (none detected)';

  // ── Essential scripts ──
  const essentialScripts = filterEssentialScripts(repo.scripts);
  const scriptLines =
    Object.entries(essentialScripts)
      .map(([name, cmd]) => `- **${name}**: \`${cmd}\``)
      .join('\n') || '(none detected)';

  return `---
${fm.trimEnd()}
---

# ${repo.name}

<!-- TODO: Agent — what this repo does, its role in the system, who/what consumes it. 1 paragraph. -->

Entry points: ${entryList}

## Architecture

${dirLines}

<!-- TODO: Agent — describe the request/data flow (e.g. "Route → Validation → Controller → Service → Model"). Note DI approach, ORM, testing framework. 10-20 lines total. -->

## Commands

${scriptLines}

## Context

After reading the codebase, create these sibling files in this directory:

**\`patterns.md\`** — How to build features in this repo. The most important file.
Include: route/controller structure, validation approach, testing patterns, naming
conventions, gotchas and tips. 20-50 lines with brief code examples.

**Domain files** — One \`{domain}.md\` per complex domain area (3-5 domains).
Each covers: key concepts, workflow/status flows, key files (5-10 with descriptions),
domain-specific patterns, cross-repo interactions. 50-150 lines each.

<!-- TODO: Agent — List the domains you'll document after exploring the codebase:
- \`{domain}.md\` — {what it covers}
-->
`;
}
