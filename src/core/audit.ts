import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { collectMdFiles } from './validate.js';
import { parseFrontmatter } from '../utils/frontmatter.js';

// ── Types ──────────────────────────────────────────────────────────────

export type IssueSeverity = 'info' | 'warning';

export type IssueKind =
  | 'todo_remaining'
  | 'scaffold_only'
  | 'prose_wall'
  | 'empty_section'
  | 'file_too_short'
  | 'file_too_long';

export interface AuditIssue {
  kind: IssueKind;
  severity: IssueSeverity;
  message: string;
  line?: number;
}

export interface FileAudit {
  path: string;
  type: string;
  repo: string | null;
  tokens: number;
  lines: number;
  content_lines: number;
  todo_count: number;
  issues: AuditIssue[];
}

export interface RepoSummary {
  name: string;
  tokens: number;
  file_count: number;
  issue_count: number;
  has_overview: boolean;
  has_patterns: boolean;
  domain_count: number;
}

export interface AuditSummary {
  total_tokens: number;
  total_files: number;
  total_issues: number;
  issues_by_kind: Partial<Record<IssueKind, number>>;
  repos: RepoSummary[];
  external_context_files: string[];
}

export interface AuditResult {
  summary: AuditSummary;
  files: FileAudit[];
}

// ── Size heuristics by type ────────────────────────────────────────────

const SIZE_LIMITS: Record<string, { min: number; max: number } | null> = {
  overview: { min: 15, max: 60 },
  patterns: { min: 15, max: 60 },
  domain: { min: 30, max: 180 },
};

// ── Public API ─────────────────────────────────────────────────────────

export function auditShards(
  workspaceRoot: string,
  outputDir?: string,
  repoFilter?: string,
): AuditResult {
  const dir = outputDir ?? '.ctxify';
  const ctxifyPath = join(workspaceRoot, dir);

  if (!existsSync(ctxifyPath)) {
    throw new Error(`${dir} directory not found`);
  }

  const mdFiles = collectMdFiles(ctxifyPath);
  const fileAudits: FileAudit[] = [];

  for (const filePath of mdFiles) {
    const audit = auditFile(filePath, ctxifyPath);
    if (repoFilter && audit.repo !== repoFilter) continue;
    fileAudits.push(audit);
  }

  const summary = buildSummary(fileAudits, workspaceRoot);
  return { summary, files: fileAudits };
}

// ── Per-file audit ─────────────────────────────────────────────────────

function auditFile(filePath: string, ctxifyPath: string): FileAudit {
  const content = readFileSync(filePath, 'utf-8');
  const relativePath = relative(ctxifyPath, filePath);
  const lines = content.split('\n');
  const frontmatter = parseFrontmatter(content);
  const type = (frontmatter?.type as string) ?? 'unknown';
  const repo = (frontmatter?.repo as string) ?? null;
  const issues: AuditIssue[] = [];

  const contentLines = countContentLines(content);
  const todoCount = countTodos(content);

  if (todoCount > 0) {
    issues.push({
      kind: 'todo_remaining',
      severity: 'warning',
      message: `${todoCount} unfilled TODO marker${todoCount > 1 ? 's' : ''}`,
    });
  }

  if (isScaffoldOnly(content)) {
    issues.push({
      kind: 'scaffold_only',
      severity: 'warning',
      message: 'Template with no agent content (fewer than 3 content lines)',
    });
  }

  for (const wall of findProseWalls(content)) {
    issues.push({
      kind: 'prose_wall',
      severity: 'info',
      message: `Paragraph with ${wall.sentences} sentences`,
      line: wall.line,
    });
  }

  for (const empty of findEmptySections(lines)) {
    issues.push({
      kind: 'empty_section',
      severity: 'info',
      message: `Empty section: "${empty.heading}"`,
      line: empty.line,
    });
  }

  const sizeIssues = checkSizeHeuristics(type, contentLines);
  issues.push(...sizeIssues);

  return {
    path: relativePath,
    type,
    repo,
    tokens: Math.floor(content.length / 4),
    lines: lines.length,
    content_lines: contentLines,
    todo_count: todoCount,
    issues,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function countContentLines(content: string): number {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterDone = false;
  let count = 0;

  for (const line of lines) {
    if (!frontmatterDone && line.trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        frontmatterDone = true;
        continue;
      }
    }
    if (inFrontmatter && !frontmatterDone) continue;

    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) continue;
    count++;
  }

  return count;
}

function countTodos(content: string): number {
  const matches = content.match(/<!-- TODO:/g);
  return matches ? matches.length : 0;
}

function isScaffoldOnly(content: string): boolean {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterDone = false;
  let substantiveLines = 0;

  for (const line of lines) {
    if (!frontmatterDone && line.trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        frontmatterDone = true;
        continue;
      }
    }
    if (inFrontmatter && !frontmatterDone) continue;

    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('<!--')) continue;
    substantiveLines++;
  }

  return substantiveLines < 3;
}

interface ProseWall {
  sentences: number;
  line: number;
}

function findProseWalls(content: string): ProseWall[] {
  const walls: ProseWall[] = [];
  const lines = content.split('\n');
  let blockLines: string[] = [];
  let blockStartLine = 0;

  function flushBlock(): void {
    if (blockLines.length === 0) return;
    const blockText = blockLines.join(' ');
    const firstChar = blockText.trimStart()[0];
    if (firstChar && ['#', '-', '*', '>', '`', '|'].includes(firstChar)) {
      blockLines = [];
      return;
    }
    if (blockText.trimStart().startsWith('<!--')) {
      blockLines = [];
      return;
    }

    // Count sentences: split on ". ", "? ", "! " and line-ending punctuation
    const sentenceEndings = blockText.match(/[.?!](?:\s|$)/g);
    const sentenceCount = sentenceEndings ? sentenceEndings.length : 0;

    if (sentenceCount > 5) {
      walls.push({ sentences: sentenceCount, line: blockStartLine });
    }
    blockLines = [];
  }

  // Skip frontmatter
  let inFrontmatter = false;
  let frontmatterDone = false;
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;
    if (!frontmatterDone && line.trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        frontmatterDone = true;
        continue;
      }
    }
    if (inFrontmatter && !frontmatterDone) continue;

    if (line.trim() === '') {
      flushBlock();
    } else {
      if (blockLines.length === 0) {
        blockStartLine = lineNum;
      }
      blockLines.push(line);
    }
  }
  flushBlock();

  return walls;
}

interface EmptySection {
  heading: string;
  line: number;
}

function findEmptySections(lines: string[]): EmptySection[] {
  const empties: EmptySection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('#')) continue;

    // Check if everything between this heading and the next heading/EOF is empty
    let hasContent = false;
    for (let j = i + 1; j < lines.length; j++) {
      const nextTrimmed = lines[j].trim();
      if (nextTrimmed.startsWith('#')) break;
      if (nextTrimmed !== '') {
        hasContent = true;
        break;
      }
    }

    if (!hasContent) {
      // Don't flag the last heading if it's at EOF with nothing after it
      // (but do flag heading followed by another heading)
      const nextHeadingOrEof =
        i + 1 < lines.length &&
        lines.slice(i + 1).some((l) => l.trim() !== '');

      if (nextHeadingOrEof) {
        empties.push({
          heading: trimmed.replace(/^#+\s*/, ''),
          line: i + 1,
        });
      }
    }
  }

  return empties;
}

function checkSizeHeuristics(type: string, contentLines: number): AuditIssue[] {
  const limits = SIZE_LIMITS[type];
  if (!limits) return [];

  const issues: AuditIssue[] = [];

  if (contentLines < limits.min) {
    issues.push({
      kind: 'file_too_short',
      severity: 'warning',
      message: `${type} has ${contentLines} content lines (minimum ${limits.min})`,
    });
  }

  if (contentLines > limits.max) {
    issues.push({
      kind: 'file_too_long',
      severity: 'warning',
      message: `${type} has ${contentLines} content lines (maximum ${limits.max})`,
    });
  }

  return issues;
}

const EXTERNAL_CONTEXT_PATHS = [
  'CLAUDE.md',
  '.claude/CLAUDE.md',
  'AGENTS.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];

function detectExternalContextFiles(workspaceRoot: string): string[] {
  return EXTERNAL_CONTEXT_PATHS.filter((p) => existsSync(join(workspaceRoot, p)));
}

// ── Summary builder ────────────────────────────────────────────────────

function buildSummary(files: FileAudit[], workspaceRoot: string): AuditSummary {
  const repoMap = new Map<string, RepoSummary>();

  for (const file of files) {
    if (!file.repo) continue;

    if (!repoMap.has(file.repo)) {
      repoMap.set(file.repo, {
        name: file.repo,
        tokens: 0,
        file_count: 0,
        issue_count: 0,
        has_overview: false,
        has_patterns: false,
        domain_count: 0,
      });
    }

    const repo = repoMap.get(file.repo)!;
    repo.tokens += file.tokens;
    repo.file_count++;
    repo.issue_count += file.issues.length;
    if (file.type === 'overview') repo.has_overview = true;
    if (file.type === 'patterns') repo.has_patterns = true;
    if (file.type === 'domain') repo.domain_count++;
  }

  const issuesByKind: Partial<Record<IssueKind, number>> = {};
  for (const file of files) {
    for (const issue of file.issues) {
      issuesByKind[issue.kind] = (issuesByKind[issue.kind] ?? 0) + 1;
    }
  }

  return {
    total_tokens: files.reduce((sum, f) => sum + f.tokens, 0),
    total_files: files.length,
    total_issues: files.reduce((sum, f) => sum + f.issues.length, 0),
    issues_by_kind: issuesByKind,
    repos: Array.from(repoMap.values()),
    external_context_files: detectExternalContextFiles(workspaceRoot),
  };
}
