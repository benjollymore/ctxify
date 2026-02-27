import { describe, it, expect } from 'vitest';
import { extractSegments } from '../../src/utils/segments.js';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';

// Test shard files are now markdown with segment markers.

describe('segment extraction: endpoints', () => {
  const content = `# api — Endpoints

<!-- endpoint:GET:/users -->
**GET /users** — \`src/routes/users.ts:5\` (getUsers)
<!-- /endpoint -->

<!-- endpoint:POST:/users -->
**POST /users** — \`src/routes/users.ts:20\` (createUser)
<!-- /endpoint -->

<!-- endpoint:GET:/health -->
**GET /health** — \`src/index.ts:10\`
<!-- /endpoint -->

<!-- endpoint:DELETE:/users/:id -->
**DELETE /users/:id** — \`src/routes/users.ts:30\`
<!-- /endpoint -->
`;

  it('extracts all segments when no filter', () => {
    const segments = extractSegments(content, 'endpoint');
    expect(segments).toHaveLength(4);
  });

  it('filters by method (attr index 0, exact)', () => {
    const segments = extractSegments(content, 'endpoint', { index: 0, value: 'GET', exact: true });
    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain('GET /users');
    expect(segments[1]).toContain('GET /health');
  });

  it('filters by path substring (attr index 1)', () => {
    const segments = extractSegments(content, 'endpoint', { index: 1, value: 'users' });
    expect(segments).toHaveLength(3);
  });

  it('returns empty when no match', () => {
    const segments = extractSegments(content, 'endpoint', {
      index: 0,
      value: 'PATCH',
      exact: true,
    });
    expect(segments).toHaveLength(0);
  });
});

describe('segment extraction: types', () => {
  const content = `# Shared Types

<!-- type:UserProfile:interface -->
### UserProfile
Defined in **api**, used by **web**.
<!-- /type -->

<!-- type:ApiResponse:type -->
### ApiResponse
Defined in **api**, used by **web**.
<!-- /type -->

<!-- type:Config:interface -->
### Config
Internal config type.
<!-- /type -->
`;

  it('filters by exact name (attr index 0)', () => {
    const segments = extractSegments(content, 'type', {
      index: 0,
      value: 'UserProfile',
      exact: true,
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain('UserProfile');
  });

  it('returns all when no filter', () => {
    const segments = extractSegments(content, 'type');
    expect(segments).toHaveLength(3);
  });

  it('returns empty when name not found', () => {
    const segments = extractSegments(content, 'type', {
      index: 0,
      value: 'NonExistent',
      exact: true,
    });
    expect(segments).toHaveLength(0);
  });
});

describe('segment extraction: env', () => {
  const content = `# Environment Variables

<!-- env:DATABASE_URL -->
**DATABASE_URL** — shared
<!-- /env -->

<!-- env:PORT -->
**PORT** — api only
<!-- /env -->

<!-- env:API_URL -->
**API_URL** — web only
<!-- /env -->
`;

  it('extracts by exact name', () => {
    const segments = extractSegments(content, 'env', { index: 0, value: 'PORT', exact: true });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain('PORT');
  });

  it('extracts all env segments', () => {
    const segments = extractSegments(content, 'env');
    expect(segments).toHaveLength(3);
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
