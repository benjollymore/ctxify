import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from '../utils/frontmatter.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Supported segment tags ─────────────────────────────────────────────

const SEGMENT_TAGS = ['endpoint', 'type', 'env', 'model', 'question'];

// ── Public API ─────────────────────────────────────────────────────────

export function validateShards(workspaceRoot: string, outputDir?: string): ValidationResult {
  const dir = outputDir ?? '.ctxify';
  const ctxifyPath = join(workspaceRoot, dir);

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Index exists
  const indexPath = join(ctxifyPath, 'index.md');
  if (!existsSync(indexPath)) {
    errors.push('index.md not found in ' + dir);
    return { valid: false, errors, warnings };
  }

  // 2. Valid frontmatter
  const indexContent = readFileSync(indexPath, 'utf-8');
  const frontmatter = parseFrontmatter(indexContent);
  if (frontmatter === null) {
    errors.push('invalid frontmatter in index.md');
  }

  // Collect all .md files recursively
  const mdFiles = collectMdFiles(ctxifyPath);

  // 3. Segment marker matching
  for (const filePath of mdFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = filePath.slice(ctxifyPath.length + 1);
    checkSegmentMarkers(content, relativePath, errors);
  }

  // 4. TODO warnings
  for (const filePath of mdFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = filePath.slice(ctxifyPath.length + 1);
    checkTodoMarkers(content, relativePath, warnings);
  }

  // 5. Totals consistency (warning only)
  if (frontmatter !== null) {
    checkTotalsConsistency(frontmatter, mdFiles, ctxifyPath, warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function collectMdFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile() && entry.endsWith('.md')) {
          files.push(fullPath);
        }
      } catch {
        // skip inaccessible
      }
    }
  }

  walk(dir);
  return files.sort();
}

function checkSegmentMarkers(content: string, relativePath: string, errors: string[]): void {
  for (const tag of SEGMENT_TAGS) {
    // Match opening markers: <!-- tag:... -->
    const openPattern = new RegExp(`<!--\\s*${tag}:`, 'g');
    // Match closing markers: <!-- /tag -->
    const closePattern = new RegExp(`<!--\\s*/${tag}\\s*-->`, 'g');

    const openCount = (content.match(openPattern) || []).length;
    const closeCount = (content.match(closePattern) || []).length;

    if (openCount !== closeCount) {
      errors.push(
        `unmatched segment marker "${tag}" in ${relativePath}: ${openCount} opening vs ${closeCount} closing`,
      );
    }
  }
}

function checkTodoMarkers(content: string, relativePath: string, warnings: string[]): void {
  const todoPattern = /<!--\s*TODO:/g;
  let match;
  while ((match = todoPattern.exec(content)) !== null) {
    // Extract a snippet of the TODO text for the warning
    const snippet = content.slice(match.index, match.index + 80).replace(/\n/g, ' ').trim();
    warnings.push(`TODO marker in ${relativePath}: ${snippet}`);
  }
}

function checkTotalsConsistency(
  frontmatter: Record<string, unknown>,
  mdFiles: string[],
  ctxifyPath: string,
  warnings: string[],
): void {
  const totals = frontmatter.totals as Record<string, number> | undefined;
  if (!totals || typeof totals.endpoints !== 'number') return;

  const declaredEndpoints = totals.endpoints;

  // Count actual <!-- endpoint: segments across all endpoint files
  let actualEndpoints = 0;
  for (const filePath of mdFiles) {
    const relativePath = filePath.slice(ctxifyPath.length + 1);
    if (!relativePath.startsWith('endpoints')) continue;

    const content = readFileSync(filePath, 'utf-8');
    const matches = content.match(/<!--\s*endpoint:/g);
    if (matches) {
      actualEndpoints += matches.length;
    }
  }

  if (declaredEndpoints !== actualEndpoints) {
    warnings.push(
      `totals.endpoints mismatch: frontmatter says ${declaredEndpoints}, found ${actualEndpoints} endpoint segments`,
    );
  }
}
