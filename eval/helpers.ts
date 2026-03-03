import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TokenUsage } from './types.js';

// ── File Reading ────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

export function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

export function wrapSourceFile(relativePath: string): string {
  const content = readProjectFile(relativePath);
  return `<source_file path="${relativePath}">\n${content}\n</source_file>`;
}

export function wrapContextFile(relativePath: string): string {
  const content = readProjectFile(relativePath);
  return `<context_file path="${relativePath}">\n${content}\n</context_file>`;
}

// ── Cost Tracking ───────────────────────────────────────────────────────

// Pricing per million tokens (Claude Sonnet 4 as default)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
};

const DEFAULT_PRICING = { input: 3.0, output: 15.0 };

export function estimateCost(usage: TokenUsage, model: string): number {
  const pricing = PRICING[model] ?? DEFAULT_PRICING;
  return (
    (usage.inputTokens / 1_000_000) * pricing.input +
    (usage.outputTokens / 1_000_000) * pricing.output
  );
}

export function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
}
