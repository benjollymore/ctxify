import { dumpYaml } from '../utils/yaml.js';

// ── Types ────────────────────────────────────────────────────────────────

interface CorrectionsTemplateData {
  repo: string;
}

interface CorrectionEntryData {
  body: string;
  timestamp: string;
}

interface AntiPatternEntryData {
  body: string;
  source?: string;
  timestamp: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

export const ANTI_PATTERNS_SECTION_HEADER =
  '\n\n# Anti-Patterns\n\nProactively logged code issues — discovered during setup or feature work.\n';

// ── Generator ────────────────────────────────────────────────────────────

export function generateCorrectionsTemplate(data: CorrectionsTemplateData): string {
  const fm = dumpYaml({
    repo: data.repo,
    type: 'corrections',
  });

  return `---
${fm.trimEnd()}
---

# Corrections

Agent-logged corrections. Always loaded alongside overview.md to prevent repeating past mistakes.
`;
}

export function formatCorrectionEntry(data: CorrectionEntryData): string {
  return `\n<!-- correction:${data.timestamp} -->\n${data.body}\n<!-- /correction -->\n`;
}

export function formatAntiPatternEntry(data: AntiPatternEntryData): string {
  const bodyLine = data.source ? `${data.body} — \`${data.source}\`` : data.body;
  return `\n<!-- antipattern:${data.timestamp} -->\n${bodyLine}\n<!-- /antipattern -->\n`;
}
