import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentResponse } from './types.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface AssemblyResult {
  items: AgentResponse[];
  found: number;
  missing: string[];
}

// ── Key Discovery ──────────────────────────────────────────────────────

const EVAL_KEY_RE = /<!-- eval-key: (.+?) -->/;

export function extractEvalKey(content: string): string | null {
  const match = content.match(EVAL_KEY_RE);
  return match ? match[1] : null;
}

/**
 * Convert a prompt key like "trpc-add-bun-adapter:baseline:0" to
 * an underscore-based filename stem: "trpc-add-bun-adapter_baseline_0"
 */
export function keyToFilenameStem(key: string): string {
  return key.replace(/:/g, '_');
}

// ── Format Detection & Extraction ──────────────────────────────────────

function isJsonlTranscript(content: string): boolean {
  const firstLine = content.trimStart().split('\n')[0]?.trim() ?? '';
  if (!firstLine.startsWith('{')) return false;
  try {
    const obj = JSON.parse(firstLine);
    return 'role' in obj;
  } catch {
    return false;
  }
}

/**
 * Extract last assistant message text from a JSONL Claude Code transcript.
 * Walks lines backwards to find the last assistant message with text content.
 */
function extractFromJsonl(content: string): string {
  const lines = content.trim().split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;

    let msg: { role?: string; content?: unknown };
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }

    if (msg.role !== 'assistant') continue;

    if (typeof msg.content === 'string') {
      return msg.content;
    }

    if (Array.isArray(msg.content)) {
      const textParts: string[] = [];
      for (const part of msg.content) {
        if (typeof part === 'string') {
          textParts.push(part);
        } else if (
          part &&
          typeof part === 'object' &&
          'type' in part &&
          part.type === 'text' &&
          'text' in part
        ) {
          textParts.push(part.text as string);
        }
      }
      if (textParts.length > 0) {
        return textParts.join('\n');
      }
    }
  }

  return '';
}

// ── Code Block Extraction ──────────────────────────────────────────────

const CODE_BLOCK_RE = /```[\s\S]*?\n([\s\S]*?)```/g;

export function extractCodeBlocks(text: string): string {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = CODE_BLOCK_RE.exec(text)) !== null) {
    const block = match[1].trim();
    if (block) blocks.push(block);
  }

  // Reset lastIndex for stateful regex
  CODE_BLOCK_RE.lastIndex = 0;

  if (blocks.length > 0) {
    return blocks.join('\n\n');
  }

  // Fallback: last 5000 chars
  return text.slice(-5000);
}

// ── Assembly ───────────────────────────────────────────────────────────

export function assembleFromRawDir(
  rawDir: string,
  expectedKeys: string[],
  options: { extractCode: boolean },
): AssemblyResult {
  let files: string[];
  try {
    files = readdirSync(rawDir).filter((f) => !f.startsWith('.'));
  } catch {
    return { items: [], found: 0, missing: [...expectedKeys] };
  }

  const keySet = new Set(expectedKeys);
  const foundKeys = new Map<string, AgentResponse>();
  const duplicates: string[] = [];

  // Build filename stem → key lookup for fallback matching
  const stemToKey = new Map<string, string>();
  for (const key of expectedKeys) {
    stemToKey.set(keyToFilenameStem(key), key);
  }

  for (const file of files) {
    const filePath = resolve(rawDir, file);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    if (!content.trim()) {
      console.warn(`Warning: empty file skipped: ${file}`);
      continue;
    }

    // Extract text from format
    let text: string;
    if (isJsonlTranscript(content)) {
      text = extractFromJsonl(content);
    } else {
      text = content;
    }

    if (!text.trim()) {
      console.warn(`Warning: empty extraction from: ${file}`);
      continue;
    }

    // Discover key
    let key = extractEvalKey(text);

    // Fallback: try embedded key in raw content (for JSONL where key is in a user message)
    if (!key) {
      key = extractEvalKey(content);
    }

    // Fallback: filename matching
    if (!key) {
      const stem = file.replace(/\.[^.]+$/, '');
      key = stemToKey.get(stem) ?? null;
    }

    if (!key || !keySet.has(key)) {
      if (key) {
        console.warn(`Warning: key "${key}" from ${file} not in expected keys`);
      } else {
        console.warn(`Warning: could not determine key for ${file}`);
      }
      continue;
    }

    if (foundKeys.has(key)) {
      duplicates.push(key);
    }

    const output = options.extractCode ? extractCodeBlocks(text) : text;
    foundKeys.set(key, { key, output });
  }

  if (duplicates.length > 0) {
    console.warn(`Warning: duplicate keys (last one wins): ${duplicates.join(', ')}`);
  }

  const missing = expectedKeys.filter((k) => !foundKeys.has(k));
  const items = expectedKeys.filter((k) => foundKeys.has(k)).map((k) => foundKeys.get(k)!);

  return { items, found: items.length, missing };
}
