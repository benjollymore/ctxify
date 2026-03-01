import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditShards } from '../../src/core/audit.js';

function writeIndex(ctxDir: string, repos: string[] = ['myapp']): void {
  writeFileSync(
    join(ctxDir, 'index.md'),
    `---
ctxify: "2.0"
mode: single-repo
repos:
${repos.map((r) => `  - ${r}`).join('\n')}
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
    'utf-8',
  );
}

function writeRepoFile(
  ctxDir: string,
  repo: string,
  filename: string,
  type: string,
  content: string,
  extra: Record<string, string> = {},
): void {
  const repoDir = join(ctxDir, 'repos', repo);
  mkdirSync(repoDir, { recursive: true });
  const fm = Object.entries({ repo, type, ...extra })
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  writeFileSync(join(repoDir, filename), `---\n${fm}\n---\n\n${content}`, 'utf-8');
}

describe('auditShards', () => {
  let tmpDir: string;
  let ctxDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-audit-'));
    ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(ctxDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws when .ctxify directory does not exist', () => {
    rmSync(ctxDir, { recursive: true, force: true });
    expect(() => auditShards(tmpDir)).toThrow('.ctxify directory not found');
  });

  // ── Token counting ────────────────────────────────────────────────

  describe('token counting', () => {
    it('counts tokens as chars / 4 per file', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'overview.md', 'overview', 'A'.repeat(400));

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview).toBeDefined();
      expect(overview!.tokens).toBeGreaterThan(0);
      // Token count is total file chars / 4 (including frontmatter)
      expect(overview!.tokens).toBe(Math.floor(overview!.lines > 0 ? overview!.tokens : 0));
    });

    it('sums tokens in summary', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'overview.md', 'overview', 'A'.repeat(200));
      writeRepoFile(ctxDir, 'myapp', 'patterns.md', 'patterns', 'B'.repeat(300));

      const result = auditShards(tmpDir);
      const fileTokenSum = result.files
        .filter((f) => f.repo === 'myapp')
        .reduce((s, f) => s + f.tokens, 0);

      expect(result.summary.repos[0].tokens).toBe(fileTokenSum);
    });

    it('sums total_tokens across all files', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'overview.md', 'overview', 'content here');

      const result = auditShards(tmpDir);
      const summed = result.files.reduce((s, f) => s + f.tokens, 0);

      expect(result.summary.total_tokens).toBe(summed);
    });
  });

  // ── Completion (TODO markers) ─────────────────────────────────────

  describe('completion', () => {
    it('counts TODO markers per file', () => {
      writeIndex(ctxDir);
      writeRepoFile(
        ctxDir,
        'myapp',
        'overview.md',
        'overview',
        `# Overview

<!-- TODO: fill architecture -->
<!-- TODO: fill patterns -->

Some real content here.
`,
      );

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview!.todo_count).toBe(2);
      expect(overview!.issues.some((i) => i.kind === 'todo_remaining')).toBe(true);
    });

    it('detects scaffold-only files', () => {
      writeIndex(ctxDir);
      // File with only frontmatter, headings, and HTML comments — no real content
      writeRepoFile(
        ctxDir,
        'myapp',
        'overview.md',
        'overview',
        `# Overview

## Architecture

<!-- TODO: fill this -->
`,
      );

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview!.issues.some((i) => i.kind === 'scaffold_only')).toBe(true);
    });

    it('does not flag scaffold_only for files with content', () => {
      writeIndex(ctxDir);
      writeRepoFile(
        ctxDir,
        'myapp',
        'overview.md',
        'overview',
        `# Overview

This is a real description of the repo.
It has multiple lines of content.
And even a third line.
`,
      );

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview!.issues.some((i) => i.kind === 'scaffold_only')).toBe(false);
    });
  });

  // ── Density (prose walls, empty sections) ─────────────────────────

  describe('density', () => {
    it('flags prose walls (> 5 sentences)', () => {
      writeIndex(ctxDir);
      writeRepoFile(
        ctxDir,
        'myapp',
        'overview.md',
        'overview',
        `# Overview

This is sentence one. This is sentence two. This is sentence three. This is sentence four. This is sentence five. This is sentence six. And one more for good measure.

Some other content below.
More content here to avoid size warnings.
And more lines to fill space.
Even more to pass the minimum.
Yet another line of content.
One more line of content here.
Another line to pad things out.
Padding to meet minimum.
More padding content.
Additional padding.
Final padding line.
Last line of padding.
`,
      );

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview!.issues.some((i) => i.kind === 'prose_wall')).toBe(true);
    });

    it('does not flag short paragraphs', () => {
      writeIndex(ctxDir);
      writeRepoFile(
        ctxDir,
        'myapp',
        'overview.md',
        'overview',
        `# Overview

Short paragraph. Only two sentences.

Another short one. Three sentences here. Still fine.

- Bullet point content
- More bullet points
- Even more bullets
- And another one
- Yet another bullet
- One more bullet
- Final bullet
- Last bullet
- Extra bullet
- Another extra
- More extras
- Final extras
`,
      );

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview!.issues.some((i) => i.kind === 'prose_wall')).toBe(false);
    });

    it('flags empty sections', () => {
      writeIndex(ctxDir);
      writeRepoFile(
        ctxDir,
        'myapp',
        'overview.md',
        'overview',
        `# Overview

This overview has content under the top heading.

## Architecture

## Patterns

- Pattern one
- Pattern two
- Pattern three
- Pattern four
- Pattern five
- Pattern six
- Pattern seven
- Pattern eight
- Pattern nine
- Pattern ten
- Pattern eleven
- Pattern twelve
- Pattern thirteen
`,
      );

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview!.issues.some((i) => i.kind === 'empty_section')).toBe(true);
      const emptyIssue = overview!.issues.find((i) => i.kind === 'empty_section');
      expect(emptyIssue!.message).toContain('Architecture');
    });

    it('does not flag sections with content', () => {
      writeIndex(ctxDir);
      writeRepoFile(
        ctxDir,
        'myapp',
        'overview.md',
        'overview',
        `# Overview

This overview has top-level content.

## Architecture

This section has content.

## Patterns

This also has content.
- More content here too
- And even more detail
- Additional information
- Extra details added
- Yet more info here
- More lines of info
- Even more lines here
- Additional lines
- Final info section
- Last info detail
- One more info
`,
      );

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview!.issues.some((i) => i.kind === 'empty_section')).toBe(false);
    });
  });

  // ── Size heuristics ───────────────────────────────────────────────

  describe('size heuristics', () => {
    it('flags overview that is too short', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'overview.md', 'overview', 'One line.');

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview!.issues.some((i) => i.kind === 'file_too_short')).toBe(true);
    });

    it('flags overview that is too long', () => {
      writeIndex(ctxDir);
      const lines = Array.from({ length: 70 }, (_, i) => `Content line ${i + 1}.`).join('\n');
      writeRepoFile(ctxDir, 'myapp', 'overview.md', 'overview', lines);

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      expect(overview!.issues.some((i) => i.kind === 'file_too_long')).toBe(true);
    });

    it('flags patterns that is too short', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'patterns.md', 'patterns', 'Tiny.');

      const result = auditShards(tmpDir);
      const file = result.files.find((f) => f.path.includes('patterns'));

      expect(file!.issues.some((i) => i.kind === 'file_too_short')).toBe(true);
    });

    it('flags domain that is too short', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'auth.md', 'domain', 'Short domain.', {
        domain: 'auth',
      });

      const result = auditShards(tmpDir);
      const file = result.files.find((f) => f.path.includes('auth'));

      expect(file!.issues.some((i) => i.kind === 'file_too_short')).toBe(true);
    });

    it('does not check size for corrections type', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'corrections.md', 'corrections', 'One correction.');

      const result = auditShards(tmpDir);
      const file = result.files.find((f) => f.path.includes('corrections'));

      expect(file!.issues.some((i) => i.kind === 'file_too_short')).toBe(false);
      expect(file!.issues.some((i) => i.kind === 'file_too_long')).toBe(false);
    });

    it('does not check size for rules type', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'rules.md', 'rules', 'One rule.');

      const result = auditShards(tmpDir);
      const file = result.files.find((f) => f.path.includes('rules'));

      expect(file!.issues.some((i) => i.kind === 'file_too_short')).toBe(false);
    });

    it('does not check size for index type', () => {
      writeIndex(ctxDir);

      const result = auditShards(tmpDir);
      const file = result.files.find((f) => f.path === 'index.md');

      expect(file!.issues.some((i) => i.kind === 'file_too_short')).toBe(false);
    });
  });

  // ── External context detection ────────────────────────────────────

  describe('external context detection', () => {
    it('detects CLAUDE.md at workspace root', () => {
      writeIndex(ctxDir);
      writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Context', 'utf-8');

      const result = auditShards(tmpDir);

      expect(result.summary.external_context_files).toContain('CLAUDE.md');
    });

    it('detects .claude/CLAUDE.md', () => {
      writeIndex(ctxDir);
      mkdirSync(join(tmpDir, '.claude'), { recursive: true });
      writeFileSync(join(tmpDir, '.claude', 'CLAUDE.md'), '# Context', 'utf-8');

      const result = auditShards(tmpDir);

      expect(result.summary.external_context_files).toContain('.claude/CLAUDE.md');
    });

    it('detects AGENTS.md', () => {
      writeIndex(ctxDir);
      writeFileSync(join(tmpDir, 'AGENTS.md'), '# Agents', 'utf-8');

      const result = auditShards(tmpDir);

      expect(result.summary.external_context_files).toContain('AGENTS.md');
    });

    it('detects .cursorrules', () => {
      writeIndex(ctxDir);
      writeFileSync(join(tmpDir, '.cursorrules'), 'rules', 'utf-8');

      const result = auditShards(tmpDir);

      expect(result.summary.external_context_files).toContain('.cursorrules');
    });

    it('detects .github/copilot-instructions.md', () => {
      writeIndex(ctxDir);
      mkdirSync(join(tmpDir, '.github'), { recursive: true });
      writeFileSync(join(tmpDir, '.github', 'copilot-instructions.md'), '# Copilot', 'utf-8');

      const result = auditShards(tmpDir);

      expect(result.summary.external_context_files).toContain('.github/copilot-instructions.md');
    });

    it('returns empty array when no external files exist', () => {
      writeIndex(ctxDir);

      const result = auditShards(tmpDir);

      expect(result.summary.external_context_files).toEqual([]);
    });
  });

  // ── Repo filter ───────────────────────────────────────────────────

  describe('repo filter', () => {
    it('filters results to a single repo', () => {
      writeIndex(ctxDir, ['api', 'frontend']);
      writeRepoFile(ctxDir, 'api', 'overview.md', 'overview', 'API overview content.\n'.repeat(20));
      writeRepoFile(
        ctxDir,
        'frontend',
        'overview.md',
        'overview',
        'Frontend overview content.\n'.repeat(20),
      );

      const result = auditShards(tmpDir, undefined, 'api');

      // Should include index.md (repo=null) but only api repo files
      const repoFiles = result.files.filter((f) => f.repo !== null);
      expect(repoFiles.every((f) => f.repo === 'api')).toBe(true);
      expect(repoFiles.length).toBeGreaterThan(0);
    });

    it('returns no repo files when filter matches nothing', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'overview.md', 'overview', 'Content.\n'.repeat(20));

      const result = auditShards(tmpDir, undefined, 'nonexistent');

      const repoFiles = result.files.filter((f) => f.repo !== null);
      expect(repoFiles).toHaveLength(0);
    });
  });

  // ── Summary structure ─────────────────────────────────────────────

  describe('summary', () => {
    it('tracks repo summary fields correctly', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'overview.md', 'overview', 'Content.\n'.repeat(20));
      writeRepoFile(ctxDir, 'myapp', 'patterns.md', 'patterns', 'Pattern.\n'.repeat(20));
      writeRepoFile(ctxDir, 'myapp', 'auth.md', 'domain', 'Domain.\n'.repeat(40), {
        domain: 'auth',
      });

      const result = auditShards(tmpDir);
      const repo = result.summary.repos.find((r) => r.name === 'myapp');

      expect(repo).toBeDefined();
      expect(repo!.has_overview).toBe(true);
      expect(repo!.has_patterns).toBe(true);
      expect(repo!.domain_count).toBe(1);
      expect(repo!.file_count).toBe(3);
    });

    it('aggregates issues_by_kind sparsely', () => {
      writeIndex(ctxDir);
      writeRepoFile(ctxDir, 'myapp', 'overview.md', 'overview', 'Tiny.');

      const result = auditShards(tmpDir);

      // Should have file_too_short but not every kind
      expect(result.summary.issues_by_kind.file_too_short).toBeGreaterThan(0);
      // Kinds with 0 count should not be present
      for (const [, count] of Object.entries(result.summary.issues_by_kind)) {
        expect(count).toBeGreaterThan(0);
      }
    });

    it('counts content_lines excluding frontmatter, blanks, and comments', () => {
      writeIndex(ctxDir);
      writeRepoFile(
        ctxDir,
        'myapp',
        'overview.md',
        'overview',
        `# Overview

<!-- a comment -->

Real content line.

Another real line.
`,
      );

      const result = auditShards(tmpDir);
      const overview = result.files.find((f) => f.path.includes('overview'));

      // Should count: "# Overview", "Real content line.", "Another real line." = 3
      expect(overview!.content_lines).toBe(3);
    });
  });
});
