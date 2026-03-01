import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateShards } from '../../src/core/validate.js';

describe('validateShards', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-test-validate-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes for well-formed shards', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(ctxDir, { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: multi-repo
repos:
  - api-server
scanned_at: "2025-01-15T10:00:00.000Z"
---

# my-project

## Repos

| Repo | Language | Framework | Role |
|------|----------|-----------|------|
| api-server | typescript | hono | API |
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for unmatched segment markers', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
      'utf-8',
    );

    // Domain file with opening marker but no closing marker
    writeFileSync(
      join(ctxDir, 'repos', 'api', 'payments.md'),
      `---
repo: api
type: domain
domain: payments
---

# Payments

<!-- endpoint:GET:/payments -->
**GET /payments** — \`src/routes/payments.ts:12\`
Returns all payments.
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('unmatched'))).toBe(true);
  });

  it('fails for invalid frontmatter', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(ctxDir, { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0
  bad indentation: [unterminated
---

# Workspace
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('frontmatter'))).toBe(true);
  });

  it('warns for unfilled TODOs', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(ctxDir, { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: single-repo
repos:
  - my-app
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace

<!-- TODO: Agent — fill this in -->
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);

    expect(result.warnings.some((w) => w.includes('TODO'))).toBe(true);
  });

  it('ignores segment markers inside TODO comment blocks', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
      'utf-8',
    );

    // Overview with example markers inside a TODO block
    writeFileSync(
      join(ctxDir, 'repos', 'api', 'overview.md'),
      `---
repo: api
type: overview
---

# api

<!-- TODO: Agent — document patterns using this format:

<!-- endpoint:METHOD:/path -->
**METHOD /path** — \`file:line\` (handlerName)
<!-- /endpoint -->

-->
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);

    expect(result.errors).toHaveLength(0);
  });

  it('ignores segment markers inside fenced code blocks', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
      'utf-8',
    );

    // File documents how segment markers work — markers appear only inside code blocks
    writeFileSync(
      join(ctxDir, 'repos', 'api', 'validation.md'),
      `---
repo: api
type: domain
domain: validation
---

# Validation

Segment markers use HTML comments for queryable content:

\`\`\`markdown
<!-- domain-index -->
- \`payments.md\` — Payment processing
<!-- /domain-index -->

<!-- correction:2025-06-15T10:30:00.000Z -->
Auth middleware is not global.
<!-- /correction -->
\`\`\`

The validator checks that opening and closing markers are balanced.
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);

    // Should not flag unmatched markers — they're inside code blocks
    expect(result.errors).toHaveLength(0);
  });

  it('fails when index.md is missing', () => {
    const result = validateShards(tmpDir);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('passes for balanced correction markers', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
      'utf-8',
    );

    writeFileSync(
      join(ctxDir, 'repos', 'api', 'corrections.md'),
      `---
repo: api
type: corrections
---

# Corrections

<!-- correction:2025-06-15T10:30:00.000Z -->
Auth middleware is not global.
<!-- /correction -->

<!-- correction:2025-06-15T11:00:00.000Z -->
Database uses UUID, not integer IDs.
<!-- /correction -->
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for unbalanced correction markers', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
      'utf-8',
    );

    writeFileSync(
      join(ctxDir, 'repos', 'api', 'corrections.md'),
      `---
repo: api
type: corrections
---

# Corrections

<!-- correction:2025-06-15T10:30:00.000Z -->
Auth middleware is not global.
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('correction'))).toBe(true);
  });

  it('passes for balanced rule markers', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
      'utf-8',
    );

    writeFileSync(
      join(ctxDir, 'repos', 'api', 'rules.md'),
      `---
repo: api
type: rules
---

# Rules

<!-- rule:2025-06-15T10:30:00.000Z -->
Do not fragment CSS.
<!-- /rule -->

<!-- antipattern:2025-06-15T11:00:00.000Z -->
Silent catch swallows errors.
<!-- /antipattern -->
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for unbalanced rule markers', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
      'utf-8',
    );

    writeFileSync(
      join(ctxDir, 'repos', 'api', 'rules.md'),
      `---
repo: api
type: rules
---

# Rules

<!-- rule:2025-06-15T10:30:00.000Z -->
Unclosed rule marker.
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('rule'))).toBe(true);
  });

  it('handles domain-index markers without colon (no false positive)', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
      'utf-8',
    );

    writeFileSync(
      join(ctxDir, 'repos', 'api', 'overview.md'),
      `---
repo: api
type: overview
---

# api

## Context

<!-- domain-index -->
- \`payments.md\` — Payment processing
<!-- /domain-index -->
`,
      'utf-8',
    );

    // Create the referenced domain file so the existence check passes
    writeFileSync(
      join(ctxDir, 'repos', 'api', 'payments.md'),
      `---
repo: api
type: domain
domain: payments
---

# Payments
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);

    expect(result.errors).toHaveLength(0);
  });

  describe('domain file existence', () => {
    it('errors when domain file referenced in overview.md is missing', () => {
      const ctxDir = join(tmpDir, '.ctxify');
      mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

      writeFileSync(
        join(ctxDir, 'index.md'),
        `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
        'utf-8',
      );

      writeFileSync(
        join(ctxDir, 'repos', 'api', 'overview.md'),
        `---
repo: api
type: overview
---

# api

<!-- domain-index -->
- \`auth.md\` — Authentication
<!-- /domain-index -->
`,
        'utf-8',
      );

      const result = validateShards(tmpDir);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('auth.md'))).toBe(true);
    });

    it('passes when all referenced domain files exist', () => {
      const ctxDir = join(tmpDir, '.ctxify');
      mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

      writeFileSync(
        join(ctxDir, 'index.md'),
        `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
        'utf-8',
      );

      writeFileSync(
        join(ctxDir, 'repos', 'api', 'overview.md'),
        `---
repo: api
type: overview
---

# api

<!-- domain-index -->
- \`auth.md\` — Authentication
<!-- /domain-index -->
`,
        'utf-8',
      );

      writeFileSync(
        join(ctxDir, 'repos', 'api', 'auth.md'),
        `---
repo: api
type: domain
domain: auth
---

# Auth
`,
        'utf-8',
      );

      const result = validateShards(tmpDir);

      expect(result.errors).toHaveLength(0);
    });

    it('ignores template placeholder entries', () => {
      const ctxDir = join(tmpDir, '.ctxify');
      mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

      writeFileSync(
        join(ctxDir, 'index.md'),
        `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
        'utf-8',
      );

      writeFileSync(
        join(ctxDir, 'repos', 'api', 'overview.md'),
        `---
repo: api
type: overview
---

# api

<!-- domain-index -->
- \`{domain}.md\` — domain description
<!-- /domain-index -->
`,
        'utf-8',
      );

      const result = validateShards(tmpDir);

      expect(result.errors).toHaveLength(0);
    });

    it('passes when overview.md has no domain-index section', () => {
      const ctxDir = join(tmpDir, '.ctxify');
      mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });

      writeFileSync(
        join(ctxDir, 'index.md'),
        `---
ctxify: "2.0"
mode: single-repo
repos:
  - api
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
        'utf-8',
      );

      writeFileSync(
        join(ctxDir, 'repos', 'api', 'overview.md'),
        `---
repo: api
type: overview
---

# api

No domain index here.
`,
        'utf-8',
      );

      const result = validateShards(tmpDir);

      expect(result.errors).toHaveLength(0);
    });

    it('errors for each missing file across multiple repos', () => {
      const ctxDir = join(tmpDir, '.ctxify');
      mkdirSync(join(ctxDir, 'repos', 'api'), { recursive: true });
      mkdirSync(join(ctxDir, 'repos', 'frontend'), { recursive: true });

      writeFileSync(
        join(ctxDir, 'index.md'),
        `---
ctxify: "2.0"
mode: multi-repo
repos:
  - api
  - frontend
scanned_at: "2025-01-15T10:00:00.000Z"
---

# Workspace
`,
        'utf-8',
      );

      writeFileSync(
        join(ctxDir, 'repos', 'api', 'overview.md'),
        `---
repo: api
type: overview
---

# api

<!-- domain-index -->
- \`auth.md\` — Authentication
<!-- /domain-index -->
`,
        'utf-8',
      );

      writeFileSync(
        join(ctxDir, 'repos', 'frontend', 'overview.md'),
        `---
repo: frontend
type: overview
---

# frontend

<!-- domain-index -->
- \`dashboard.md\` — Dashboard
<!-- /domain-index -->
`,
        'utf-8',
      );

      const result = validateShards(tmpDir);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('auth.md'))).toBe(true);
      expect(result.errors.some((e) => e.includes('dashboard.md'))).toBe(true);
    });
  });
});
