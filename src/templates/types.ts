export function generateTypesTemplate(
  mode: 'single-repo' | 'multi-repo' | 'mono-repo',
): string {
  const heading = mode === 'single-repo' ? '# Exported Types' : '# Shared Types';

  return `${heading}

<!-- TODO: Agent — document the key types that cross repo boundaries (or are exported for consumers). Use this format:

<!-- type:Name:kind -->
**Name** — \`source/file.ts:line\`
Brief description of what this type represents and where it's used.
<!-- /type -->

-->
`;
}
