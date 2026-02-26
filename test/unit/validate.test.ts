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

    // Valid index.md with good frontmatter
    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
scanned_at: "2025-01-15T10:00:00.000Z"
workspace: /workspace
mode: multi-repo
totals:
  repos: 1
  endpoints: 1
  shared_types: 0
  env_vars: 0
---

# Workspace: my-project

## Repos

| Repo | Language | Framework | Files | Entry points |
|------|----------|-----------|-------|--------------|
| api-server | typescript | hono | 42 | \`src/index.ts\` |
`,
      'utf-8',
    );

    // A repo shard
    writeFileSync(
      join(ctxDir, 'repo-api-server.md'),
      `# api-server

## Structure
- src/
- src/routes/
`,
      'utf-8',
    );

    // An endpoints shard with matched markers
    writeFileSync(
      join(ctxDir, 'endpoints-api-server.md'),
      `# api-server — Endpoints

<!-- endpoint:GET:/users -->
**GET /users** — \`src/routes/users.ts:12\` (getUsers)
Returns all users.
<!-- /endpoint -->
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for unmatched segment markers', () => {
    const ctxDir = join(tmpDir, '.ctxify');
    mkdirSync(ctxDir, { recursive: true });

    // Valid index.md
    writeFileSync(
      join(ctxDir, 'index.md'),
      `---
ctxify: "2.0"
scanned_at: "2025-01-15T10:00:00.000Z"
workspace: /workspace
mode: single-repo
totals:
  repos: 1
  endpoints: 0
  shared_types: 0
  env_vars: 0
---

# Workspace
`,
      'utf-8',
    );

    // Endpoints shard with opening marker but no closing marker
    writeFileSync(
      join(ctxDir, 'endpoints-api-server.md'),
      `# api-server — Endpoints

<!-- endpoint:GET:/users -->
**GET /users** — \`src/routes/users.ts:12\` (getUsers)
Returns all users.
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

    // index.md with invalid YAML in frontmatter
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
scanned_at: "2025-01-15T10:00:00.000Z"
workspace: /workspace
mode: single-repo
totals:
  repos: 1
  endpoints: 0
  shared_types: 0
  env_vars: 0
---

# Workspace

<!-- TODO: Agent — fill this in -->
`,
      'utf-8',
    );

    const result = validateShards(tmpDir);

    expect(result.warnings.some((w) => w.includes('TODO'))).toBe(true);
  });

  it('fails when index.md is missing', () => {
    // No .ctxify directory at all
    const result = validateShards(tmpDir);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
