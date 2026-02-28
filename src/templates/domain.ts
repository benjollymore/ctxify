import { dumpYaml } from '../utils/yaml.js';

// ── Types ────────────────────────────────────────────────────────────────

interface DomainTemplateData {
  repo: string;
  domain: string;
  tags?: string[];
  description?: string;
}

// ── Generator ────────────────────────────────────────────────────────────

export function generateDomainTemplate(data: DomainTemplateData): string {
  const fm = dumpYaml({
    repo: data.repo,
    type: 'domain',
    domain: data.domain,
    tags: data.tags && data.tags.length > 0 ? data.tags : undefined,
  });

  return `---
${fm.trimEnd()}
---

# ${data.domain}

<!-- TODO: Agent — what this domain covers, key concepts, 2-3 sentences -->

## Concepts

<!-- TODO: Agent — key domain concepts, business rules, status/state flows. What does someone need to know to work here? -->

## Decisions

<!-- TODO: Agent — why is it built this way? What constraints or trade-offs shaped the design? -->

## Patterns

<!-- TODO: Agent — domain-specific patterns with brief code examples -->

## Cross-repo

<!-- TODO: Agent — how this domain spans repos (if applicable) -->
`;
}
