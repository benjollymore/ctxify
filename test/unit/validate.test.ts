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

  it('fails when index.md is missing', () => {
    const result = validateShards(tmpDir);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
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

    const result = validateShards(tmpDir);

    expect(result.errors).toHaveLength(0);
  });
});
