export function generateEnvTemplate(): string {
  return `# Environment Variables

<!-- TODO: Agent — scan source code for environment variable usage and document each one. Use this format:

<!-- env:NAME -->
**NAME** — required/optional
Used by: \`repo/file.ts:line\`
Description of what this variable controls.
<!-- /env -->

-->
`;
}
