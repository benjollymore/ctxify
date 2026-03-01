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

const SEGMENT_TAGS = [
  'endpoint',
  'type',
  'env',
  'model',
  'question',
  'domain-index',
  'correction',
  'antipattern',
  'rule',
];

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

  // 3. Segment marker matching (strip TODO blocks so examples aren't counted)
  for (const filePath of mdFiles) {
    const content = stripTodoBlocks(readFileSync(filePath, 'utf-8'));
    const relativePath = filePath.slice(ctxifyPath.length + 1);
    checkSegmentMarkers(content, relativePath, errors);
  }

  // 4. TODO warnings
  for (const filePath of mdFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = filePath.slice(ctxifyPath.length + 1);
    checkTodoMarkers(content, relativePath, warnings);
  }

  // 5. Domain file existence
  checkMissingDomainFiles(ctxifyPath, errors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Strip TODO comment blocks from content so example markers inside them
 * aren't counted as real segment markers by the validator.
 *
 * TODO blocks follow this pattern:
 *   <!-- TODO: ...
 *   (may contain example segment markers with inline -->)
 *   -->            ← standalone closing on its own line
 */
function stripTodoBlocks(content: string): string {
  // Only match multi-line TODO blocks where --> is NOT on the same line as <!-- TODO:
  // The negative lookahead (?:(?!-->).)* ensures we don't span past a single-line TODO's -->
  return content.replace(/<!-- TODO:(?:(?!-->).)*\n[\s\S]*?\n-->/g, '');
}

export function collectMdFiles(dir: string): string[] {
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

function stripFencedCodeBlocks(content: string): string {
  return content.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
}

function checkSegmentMarkers(content: string, relativePath: string, errors: string[]): void {
  const stripped = stripFencedCodeBlocks(content);
  for (const tag of SEGMENT_TAGS) {
    // Match opening markers: <!-- tag:... -->
    const openPattern = new RegExp(`<!--\\s*${tag}[:\\s]`, 'g');
    // Match closing markers: <!-- /tag -->
    const closePattern = new RegExp(`<!--\\s*/${tag}\\s*-->`, 'g');

    const openCount = (stripped.match(openPattern) || []).length;
    const closeCount = (stripped.match(closePattern) || []).length;

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
    const snippet = content
      .slice(match.index, match.index + 80)
      .replace(/\n/g, ' ')
      .trim();
    warnings.push(`TODO marker in ${relativePath}: ${snippet}`);
  }
}

function checkMissingDomainFiles(ctxifyPath: string, errors: string[]): void {
  const reposDir = join(ctxifyPath, 'repos');
  if (!existsSync(reposDir)) return;

  let repoDirs: string[];
  try {
    repoDirs = readdirSync(reposDir);
  } catch {
    return;
  }

  for (const repoName of repoDirs) {
    const repoPath = join(reposDir, repoName);
    try {
      if (!statSync(repoPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const overviewPath = join(repoPath, 'overview.md');
    if (!existsSync(overviewPath)) continue;

    let overviewContent: string;
    try {
      overviewContent = readFileSync(overviewPath, 'utf-8');
    } catch {
      continue;
    }

    const blockMatch = overviewContent.match(
      /<!--\s*domain-index\s*-->([\s\S]*?)<!--\s*\/domain-index\s*-->/,
    );
    if (!blockMatch) continue;

    const block = blockMatch[1];
    const entryPattern = /^\s*-\s*`([^`]+\.md)`/gm;
    let entryMatch;
    while ((entryMatch = entryPattern.exec(block)) !== null) {
      const filename = entryMatch[1];
      if (filename.includes('{') || filename.includes('}')) continue;
      if (!existsSync(join(repoPath, filename))) {
        errors.push(
          `domain file referenced in repos/${repoName}/overview.md but not found: repos/${repoName}/${filename}`,
        );
      }
    }
  }
}
