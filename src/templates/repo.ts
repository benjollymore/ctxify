import type { RepoTemplateData } from './index-md.js';

export function generateRepoTemplate(repo: RepoTemplateData): string {
  const entryList = repo.entryPoints.map((e) => `\`${e}\``).join(', ') || 'none detected';

  // ── Structure ──
  const structureLines = repo.keyDirs.map((d) => `- \`${d}/\``).join('\n') || '- (none detected)';

  // ── Dependencies ──
  const depsLines = Object.entries(repo.dependencies)
    .map(([name, version]) => `${name} ${version}`)
    .join('\n') || 'none';

  // ── Dev Dependencies ──
  const devDepsLines = Object.entries(repo.devDependencies)
    .map(([name, version]) => `${name} ${version}`)
    .join('\n') || 'none';

  // ── Scripts ──
  const scriptsLines = Object.entries(repo.scripts)
    .map(([name, cmd]) => `- **${name}**: ${cmd}`)
    .join('\n') || 'none';

  return `# ${repo.name}

<!-- TODO: Agent — write a paragraph describing this repo's role, what it exposes, and how other repos consume it. -->

Entry points: ${entryList}

## Structure

${structureLines}

## Dependencies

${depsLines}

## Dev Dependencies

${devDepsLines}

## Scripts

${scriptsLines}

## Conventions

<!-- TODO: Agent — note testing framework, linting, build tools, patterns, naming conventions, and anything else a developer should know. -->
`;
}
