export function generateEndpointsTemplate(repoName: string): string {
  return `# ${repoName} — Endpoints

<!-- TODO: Agent — read source code and document API endpoints using this format:

<!-- endpoint:METHOD:/path -->
**METHOD /path** — \`file:line\` (handlerName)
Brief description.
<!-- /endpoint -->

-->
`;
}
