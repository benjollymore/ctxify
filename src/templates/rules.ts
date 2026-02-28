import { dumpYaml } from '../utils/yaml.js';

// ── Types ────────────────────────────────────────────────────────────────

interface RulesTemplateData {
  repo: string;
}

interface RuleEntryData {
  body: string;
  source?: string;
  timestamp: string;
}

// ── Generator ────────────────────────────────────────────────────────────

export function generateRulesTemplate(data: RulesTemplateData): string {
  const fm = dumpYaml({
    repo: data.repo,
    type: 'rules',
  });

  return `---
${fm.trimEnd()}
---

# Rules

Behavioral instructions and anti-patterns. Always loaded — these are the highest-signal context.
`;
}

export function formatRuleEntry(data: RuleEntryData): string {
  const bodyLine = data.source ? `${data.body} — \`${data.source}\`` : data.body;
  return `\n<!-- rule:${data.timestamp} -->\n${bodyLine}\n<!-- /rule -->\n`;
}
