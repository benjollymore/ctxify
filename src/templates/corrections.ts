import { dumpYaml } from '../utils/yaml.js';

// ── Types ────────────────────────────────────────────────────────────────

interface CorrectionsTemplateData {
  repo: string;
}

interface CorrectionEntryData {
  body: string;
  timestamp: string;
}

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
