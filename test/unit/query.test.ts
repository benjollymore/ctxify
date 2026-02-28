import { describe, it, expect } from 'vitest';
import { extractSegments } from '../../src/utils/segments.js';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';

// Test shard files are now markdown with segment markers.
// Examples use the active v2 tags: correction, rule, domain-index.

describe('segment extraction: corrections', () => {
  const content = `# api — Corrections

<!-- correction:2025-06-15T10:30:00.000Z -->
Auth middleware is not global — it's applied per-route.
<!-- /correction -->

<!-- correction:2025-06-15T11:00:00.000Z -->
Database uses UUID, not integer IDs.
<!-- /correction -->

<!-- correction:2025-06-16T09:00:00.000Z -->
API is at /v2, not /v1.
<!-- /correction -->

<!-- correction:2025-06-17T14:00:00.000Z -->
Rate limiting is per-user, not per-IP.
<!-- /correction -->
`;

  it('extracts all segments when no filter', () => {
    const segments = extractSegments(content, 'correction');
    expect(segments).toHaveLength(4);
  });

  it('filters by timestamp substring (attr index 0)', () => {
    const segments = extractSegments(content, 'correction', { index: 0, value: '2025-06-15' });
    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain('Auth middleware');
    expect(segments[1]).toContain('UUID');
  });

  it('filters by date prefix substring (attr index 0)', () => {
    const segments = extractSegments(content, 'correction', {
      index: 0,
      value: '2025-06-16',
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain('/v2');
  });

  it('returns empty when no match', () => {
    const segments = extractSegments(content, 'correction', {
      index: 0,
      value: '2024-01-01',
      exact: true,
    });
    expect(segments).toHaveLength(0);
  });
});

describe('segment extraction: rules', () => {
  const content = `# Rules

<!-- rule:2025-06-15T10:30:00.000Z -->
Do not fragment CSS into modules.
<!-- /rule -->

<!-- rule:2025-06-16T09:00:00.000Z -->
Always use bun, not npm.
<!-- /rule -->

<!-- rule:2025-06-17T14:00:00.000Z -->
Never auto-run the linter — CI handles that.
<!-- /rule -->
`;

  it('filters by date prefix substring (attr index 0)', () => {
    const segments = extractSegments(content, 'rule', {
      index: 0,
      value: '2025-06-15',
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain('CSS');
  });

  it('returns all when no filter', () => {
    const segments = extractSegments(content, 'rule');
    expect(segments).toHaveLength(3);
  });

  it('returns empty when timestamp not found', () => {
    const segments = extractSegments(content, 'rule', {
      index: 0,
      value: '2024-01-01T00:00:00.000Z',
      exact: true,
    });
    expect(segments).toHaveLength(0);
  });
});

describe('segment extraction: domain-index', () => {
  const content = `# api overview

## Context

<!-- domain-index -->
- \`payments.md\` — Payment processing
- \`auth.md\` — Authentication and authorization
- \`notifications.md\` — Email and push notifications
<!-- /domain-index -->
`;

  it('extracts domain-index content', () => {
    const segments = extractSegments(content, 'domain-index');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain('payments.md');
    expect(segments[0]).toContain('auth.md');
  });
});

describe('frontmatter parsing', () => {
  it('parses YAML frontmatter from index', () => {
    const content = `---
ctxify: "2.0"
mode: multi-repo
totals:
  repos: 2
---

# Workspace
`;
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm!.ctxify).toBe('2.0');
    expect(fm!.mode).toBe('multi-repo');
    expect((fm!.totals as Record<string, number>).repos).toBe(2);
  });

  it('returns null for content without frontmatter', () => {
    const fm = parseFrontmatter('# Just a heading\n\nSome text.');
    expect(fm).toBeNull();
  });
});
