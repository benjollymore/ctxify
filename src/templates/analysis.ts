import { dumpYaml } from '../utils/yaml.js';
import type { RepoTemplateData } from './index-md.js';

export function generateAnalysisChecklist(repos: RepoTemplateData[]): string {
  const repoNames = repos.map((r) => r.name);

  // ── Frontmatter ──
  const fm = dumpYaml({
    status: 'pending',
    repos: repoNames,
  });

  // ── Repos detected ──
  const repoLines = repos.map((r) => {
    const tech = [r.language, r.framework].filter(Boolean).join(' / ');
    const entries = r.entryPoints.map((e) => `\`${e}\``).join(', ') || 'none';
    return `- **${r.name}** — ${tech || 'unknown'}, ${r.fileCount} files, entry points: ${entries}`;
  });

  // ── Per-shard checklist ──
  const checklistSections: string[] = [];

  for (const r of repos) {
    const dirs = r.keyDirs.length > 0 ? r.keyDirs.join(', ') : 'project root';
    const entries = r.entryPoints.join(', ') || 'unknown';

    checklistSections.push(`### ${r.name}

- [ ] Read entry points (${entries}) and write repo overview
- [ ] Scan for endpoint definitions in ${dirs}
- [ ] Document exported/shared type definitions
- [ ] Scan for env variable usage (\`process.env\`, \`os.environ\`, etc.)
- [ ] Check for database schema files (ORM models, migrations, SQL)
- [ ] Note testing patterns and conventions`);
  }

  checklistSections.push(`### Cross-cutting

- [ ] Map topology — how repos connect at runtime
- [ ] Identify shared types across repo boundaries
- [ ] Collect all environment variables into env shard
- [ ] List pending questions and unknowns`);

  return `---
${fm.trimEnd()}
---

## Repos detected

${repoLines.join('\n')}

## What to analyze

${checklistSections.join('\n\n')}
`;
}
