export function generateSchemasTemplate(repoName: string): string {
  return `# ${repoName} — Database Schemas

<!-- TODO: Agent — read ORM models, migration files, or SQL schemas and document each model. Use this format:

<!-- model:name -->
**name** — \`source/file.ts:line\`
Brief description.
Columns / fields: ...
<!-- /model -->

-->
`;
}
