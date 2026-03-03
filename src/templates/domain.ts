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

<!-- TODO: Agent — document this domain with sections that fit the content.
Suggested sections: Concepts (business rules, state flows), Decisions (why it's built this way, what broke before), Patterns (how contributors extend or modify this domain — with brief code examples), Traps (things that look correct but break — wrong placement, wrong ordering, silent failures).
Add a Cross-repo section only if this domain spans multiple repos.
Focus on: constraints, anti-patterns, and code examples over descriptions.
Use bullet points and short paragraphs. 50-150 lines total. -->
`;
}
