# Agent-Native ctxify Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform ctxify from a regex-based context compiler into an agent-native scaffolder + validator. Remove all 7 semantic regex passes, all 8 renderers, and the pipeline/cache/differ infrastructure. Replace with: mechanical manifest parsing, markdown template scaffolding, and a validate command.

**Architecture:** `ctxify init` detects repos and parses manifests mechanically, scaffolds `.ctxify/` with markdown templates (frontmatter + section markers + TODO placeholders), and writes an `_analysis.md` checklist. The calling agent (Claude Code) reads source code and fills in semantic content. `ctxify validate` checks structural integrity.

**Tech Stack:** TypeScript, Commander, Vitest, js-yaml, glob

**Reference:** See `docs/plans/2026-02-25-agent-native-design.md` for the full design.

---

### Task 1: Create `src/core/manifest.ts` — mechanical extraction

Consolidates logic from `src/passes/02-manifest-parsing.ts` and `src/passes/03-structure-mapping.ts` into a standalone module with no pass/pipeline dependencies.

**Files:**
- Create: `src/core/manifest.ts`
- Create: `test/unit/manifest.test.ts`

**Step 1: Write the failing test**

```typescript
// test/unit/manifest.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRepoManifest } from '../../src/core/manifest.js';

describe('parseRepoManifest', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-manifest-'));
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses a TypeScript package.json repo', () => {
    const repoDir = join(tmpDir, 'ts-api');
    mkdirSync(join(repoDir, 'src', 'routes'), { recursive: true });
    writeFileSync(join(repoDir, 'src', 'index.ts'), 'export const x = 1;');
    writeFileSync(join(repoDir, 'src', 'routes', 'users.ts'), 'export const y = 2;');
    writeFileSync(join(repoDir, 'package.json'), JSON.stringify({
      name: 'ts-api',
      description: 'An API server',
      main: './dist/index.js',
      scripts: { dev: 'tsx watch src/index.ts', build: 'tsc' },
      dependencies: { hono: '4.0.0' },
      devDependencies: { typescript: '5.6.0' },
    }));
    // Need tsconfig or typescript dep to detect TS
    writeFileSync(join(repoDir, 'tsconfig.json'), '{}');

    const result = parseRepoManifest(repoDir);

    expect(result.language).toBe('typescript');
    expect(result.framework).toBe('hono');
    expect(result.description).toBe('An API server');
    expect(result.manifestType).toBe('package.json');
    expect(result.dependencies).toHaveProperty('hono');
    expect(result.devDependencies).toHaveProperty('typescript');
    expect(result.scripts).toHaveProperty('dev');
    expect(result.entryPoints).toContain('src/index.ts');
    expect(result.keyDirs).toContain('src');
    expect(result.fileCount).toBeGreaterThanOrEqual(2);
  });

  it('returns empty defaults for repo with no manifest', () => {
    const repoDir = join(tmpDir, 'no-manifest');
    mkdirSync(repoDir, { recursive: true });

    const result = parseRepoManifest(repoDir);

    expect(result.language).toBe('');
    expect(result.framework).toBe('');
    expect(result.manifestType).toBe('');
    expect(result.dependencies).toEqual({});
    expect(result.scripts).toEqual({});
  });

  it('detects Python with pyproject.toml', () => {
    const repoDir = join(tmpDir, 'py-api');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'pyproject.toml'), `
[project]
name = "py-api"
dependencies = ["fastapi"]
`);

    const result = parseRepoManifest(repoDir);

    expect(result.language).toBe('python');
    expect(result.framework).toBe('fastapi');
    expect(result.manifestType).toBe('pyproject.toml');
  });

  it('detects Go with go.mod', () => {
    const repoDir = join(tmpDir, 'go-api');
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, 'go.mod'), `module example.com/api

go 1.21

require github.com/gin-gonic/gin v1.9.0
`);
    writeFileSync(join(repoDir, 'main.go'), 'package main');

    const result = parseRepoManifest(repoDir);

    expect(result.language).toBe('go');
    expect(result.framework).toBe('gin');
    expect(result.manifestType).toBe('go.mod');
    expect(result.entryPoints).toContain('main.go');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/manifest.test.ts`
Expected: FAIL — `parseRepoManifest` does not exist

**Step 3: Write implementation**

Create `src/core/manifest.ts`. Extract the following logic:
- From `src/passes/02-manifest-parsing.ts`: `detectFramework()`, `detectGoFramework()`, `detectPythonFramework()`, package.json/go.mod/pyproject.toml parsing
- From `src/passes/03-structure-mapping.ts`: `discoverEntryPoints()`, `discoverKeyDirs()`, `countFiles()`, `resolveSourcePath()`
- From `src/utils/regex-patterns.ts`: `FRAMEWORK_INDICATORS` (copy inline since we'll delete that file)

The exported function signature:

```typescript
export interface ManifestData {
  language: string;
  framework: string;
  description: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  manifestType: string;
  entryPoints: string[];
  keyDirs: string[];
  fileCount: number;
}

export function parseRepoManifest(repoPath: string, excludePatterns?: string[]): ManifestData;
```

The function tries package.json, then go.mod, then pyproject.toml, then requirements.txt. Falls back to empty defaults. After detecting the manifest, it calls the entry point/key dir/file count helpers from structure-mapping.

Import `readJsonFile`, `readFileIfExists`, `isFile`, `isDirectory` from `../utils/fs.js`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/manifest.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/manifest.ts test/unit/manifest.test.ts
git commit -m "feat: create manifest.ts — consolidated mechanical repo extraction"
```

---

### Task 2: Create template generators

One file per shard template. Each template function takes mechanical data and returns a markdown string with YAML frontmatter, section markers, and TODO placeholders for semantic content.

**Files:**
- Create: `src/templates/index-md.ts`
- Create: `src/templates/repo.ts`
- Create: `src/templates/endpoints.ts`
- Create: `src/templates/types.ts`
- Create: `src/templates/env.ts`
- Create: `src/templates/topology.ts`
- Create: `src/templates/schemas.ts`
- Create: `src/templates/questions.ts`
- Create: `src/templates/analysis.ts`
- Create: `test/unit/templates.test.ts`

**Step 1: Write the failing tests**

```typescript
// test/unit/templates.test.ts
import { describe, it, expect } from 'vitest';
import { generateIndexTemplate } from '../../src/templates/index-md.js';
import { generateRepoTemplate } from '../../src/templates/repo.js';
import { generateEndpointsTemplate } from '../../src/templates/endpoints.js';
import { generateTypesTemplate } from '../../src/templates/types.js';
import { generateEnvTemplate } from '../../src/templates/env.js';
import { generateTopologyTemplate } from '../../src/templates/topology.js';
import { generateSchemasTemplate } from '../../src/templates/schemas.js';
import { generateQuestionsTemplate } from '../../src/templates/questions.js';
import { generateAnalysisChecklist } from '../../src/templates/analysis.js';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';
import type { ManifestData } from '../../src/core/manifest.js';

const testRepo: ManifestData & { name: string; path: string } = {
  name: 'api',
  path: '/workspace/api',
  language: 'typescript',
  framework: 'hono',
  description: 'API server',
  manifestType: 'package.json',
  entryPoints: ['src/index.ts'],
  keyDirs: ['src', 'src/routes'],
  fileCount: 15,
  dependencies: { hono: '4.0.0' },
  devDependencies: { typescript: '5.6.0' },
  scripts: { dev: 'tsx watch src/index.ts', build: 'tsc' },
};

const testRepo2: ManifestData & { name: string; path: string } = {
  name: 'web',
  path: '/workspace/web',
  language: 'typescript',
  framework: 'react',
  description: 'Frontend',
  manifestType: 'package.json',
  entryPoints: ['src/main.tsx'],
  keyDirs: ['src', 'src/components'],
  fileCount: 30,
  dependencies: { react: '18.2.0' },
  devDependencies: { vite: '5.0.0' },
  scripts: { dev: 'vite', build: 'vite build' },
};

const repos = [testRepo, testRepo2];

describe('index template', () => {
  it('produces markdown with YAML frontmatter', () => {
    const output = generateIndexTemplate(repos, '/workspace', 'multi-repo');
    expect(output).toMatch(/^---\n/);
    const fm = parseFrontmatter(output);
    expect(fm).not.toBeNull();
    expect(fm!.ctxify).toBe('2.0');
    expect(fm!.mode).toBe('multi-repo');
  });

  it('includes repo table with mechanical data', () => {
    const output = generateIndexTemplate(repos, '/workspace', 'multi-repo');
    expect(output).toContain('| **api**');
    expect(output).toContain('| **web**');
    expect(output).toContain('typescript');
    expect(output).toContain('hono');
  });

  it('includes TODO marker for narrative', () => {
    const output = generateIndexTemplate(repos, '/workspace', 'multi-repo');
    expect(output).toContain('<!-- TODO:');
  });

  it('includes shard pointers', () => {
    const output = generateIndexTemplate(repos, '/workspace', 'multi-repo');
    expect(output).toContain('.ctxify/repos/');
    expect(output).toContain('.ctxify/endpoints/');
    expect(output).toContain('.ctxify/types/shared.md');
  });

  it('has zero totals for agent-filled sections', () => {
    const output = generateIndexTemplate(repos, '/workspace', 'multi-repo');
    const fm = parseFrontmatter(output)!;
    const totals = fm.totals as Record<string, number>;
    expect(totals.repos).toBe(2);
    expect(totals.endpoints).toBe(0);
    expect(totals.shared_types).toBe(0);
    expect(totals.env_vars).toBe(0);
  });
});

describe('repo template', () => {
  it('includes name, deps, scripts, structure', () => {
    const output = generateRepoTemplate(testRepo);
    expect(output).toContain('# api');
    expect(output).toContain('hono 4.0.0');
    expect(output).toContain('**dev**');
    expect(output).toContain('src/routes');
  });

  it('includes TODO for narrative and conventions', () => {
    const output = generateRepoTemplate(testRepo);
    expect(output).toContain('<!-- TODO:');
  });
});

describe('endpoints template', () => {
  it('includes repo name and TODO instructions', () => {
    const output = generateEndpointsTemplate('api');
    expect(output).toContain('# api');
    expect(output).toContain('Endpoints');
    expect(output).toContain('<!-- TODO:');
    expect(output).toContain('<!-- endpoint:');
  });
});

describe('types template', () => {
  it('includes header and TODO', () => {
    const output = generateTypesTemplate('multi-repo');
    expect(output).toContain('Shared Types');
    expect(output).toContain('<!-- TODO:');
    expect(output).toContain('<!-- type:');
  });

  it('uses "Exported Types" for single-repo', () => {
    const output = generateTypesTemplate('single-repo');
    expect(output).toContain('Exported Types');
  });
});

describe('env template', () => {
  it('includes header and segment marker instructions', () => {
    const output = generateEnvTemplate();
    expect(output).toContain('Environment Variables');
    expect(output).toContain('<!-- TODO:');
    expect(output).toContain('<!-- env:');
  });
});

describe('topology template', () => {
  it('includes repo list from mechanical data', () => {
    const output = generateTopologyTemplate(repos);
    expect(output).toContain('**api** — typescript / hono');
    expect(output).toContain('**web** — typescript / react');
    expect(output).toContain('<!-- TODO:');
  });
});

describe('schemas template', () => {
  it('includes repo name and TODO', () => {
    const output = generateSchemasTemplate('api');
    expect(output).toContain('# api');
    expect(output).toContain('Schema');
    expect(output).toContain('<!-- TODO:');
  });
});

describe('questions template', () => {
  it('includes header and instructions', () => {
    const output = generateQuestionsTemplate();
    expect(output).toContain('Questions');
    expect(output).toContain('<!-- TODO:');
  });
});

describe('analysis checklist', () => {
  it('lists all repos with mechanical data', () => {
    const output = generateAnalysisChecklist(repos);
    expect(output).toContain('api');
    expect(output).toContain('web');
    expect(output).toContain('typescript/hono');
  });

  it('includes checklist items for each shard type', () => {
    const output = generateAnalysisChecklist(repos);
    expect(output).toContain('Endpoints');
    expect(output).toContain('Types');
    expect(output).toContain('Environment');
    expect(output).toContain('Relationships');
    expect(output).toContain('Schemas');
    expect(output).toContain('Conventions');
  });

  it('has YAML frontmatter with status', () => {
    const output = generateAnalysisChecklist(repos);
    const fm = parseFrontmatter(output);
    expect(fm).not.toBeNull();
    expect(fm!.status).toBe('pending');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/templates.test.ts`
Expected: FAIL — modules don't exist

**Step 3: Write implementation**

Create each template file. Each exports a single function that returns a markdown string. Key patterns:

- **Frontmatter**: Use `js-yaml` `dump()` for the YAML block between `---` delimiters
- **TODO markers**: `<!-- TODO: Agent — [specific instruction] -->`
- **Segment marker examples**: Show the expected format in TODO comments so the agent knows the syntax
- **Mechanical data**: Pre-filled from `ManifestData` fields

The `repos` parameter to templates is `Array<ManifestData & { name: string; path: string }>`.

Template functions receive only the data they need — no WorkspaceContext.

For `src/templates/index-md.ts`:
```typescript
import yaml from 'js-yaml';
import type { ManifestData } from '../core/manifest.js';
import type { OperatingMode } from '../core/config.js';

export interface RepoTemplateData extends ManifestData {
  name: string;
  path: string;
}

export function generateIndexTemplate(
  repos: RepoTemplateData[],
  workspacePath: string,
  mode: OperatingMode,
  metadata?: { generatedAt?: string; ctxifyVersion?: string },
): string {
  // Build frontmatter, repo table, TODO sections, shard pointers
}
```

Follow this same pattern for all other template files. Each template returns a complete markdown string.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/templates.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/templates/ test/unit/templates.test.ts
git commit -m "feat: add template generators for all shard types"
```

---

### Task 3: Create `src/cli/commands/validate.ts`

Quality gate that checks structural integrity of filled shards.

**Files:**
- Create: `src/cli/commands/validate.ts`
- Create: `test/unit/validate.test.ts`

**Step 1: Write the failing test**

```typescript
// test/unit/validate.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateShards, type ValidationResult } from '../../src/core/validate.js';

describe('validateShards', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-validate-'));
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes for well-formed shards', () => {
    const ctxDir = join(tmpDir, 'good', '.ctxify');
    mkdirSync(join(ctxDir, 'repos'), { recursive: true });
    mkdirSync(join(ctxDir, 'endpoints'), { recursive: true });

    writeFileSync(join(ctxDir, 'index.md'), `---
ctxify: "2.0"
totals:
  repos: 1
  endpoints: 1
  shared_types: 0
  env_vars: 0
---

# Workspace: test

One repo.

## Repos

| Repo | Language |
|------|----------|
| **api** | typescript |
`);
    writeFileSync(join(ctxDir, 'repos', 'api.md'), `# api

A typescript API server.

## Dependencies

hono 4.0.0
`);
    writeFileSync(join(ctxDir, 'endpoints', 'api.md'), `# api — Endpoints

<!-- endpoint:GET:/users -->
**GET /users** — \`src/routes/users.ts:5\`
<!-- /endpoint -->
`);

    const result = validateShards(join(tmpDir, 'good'));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for unmatched segment markers', () => {
    const ctxDir = join(tmpDir, 'bad-segments', '.ctxify');
    mkdirSync(join(ctxDir, 'endpoints'), { recursive: true });
    writeFileSync(join(ctxDir, 'index.md'), `---
ctxify: "2.0"
totals:
  repos: 0
  endpoints: 0
  shared_types: 0
  env_vars: 0
---
# test
`);
    writeFileSync(join(ctxDir, 'endpoints', 'api.md'), `# api — Endpoints

<!-- endpoint:GET:/users -->
**GET /users**
`); // Missing <!-- /endpoint -->

    const result = validateShards(join(tmpDir, 'bad-segments'));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('unmatched'))).toBe(true);
  });

  it('fails for invalid frontmatter', () => {
    const ctxDir = join(tmpDir, 'bad-fm', '.ctxify');
    mkdirSync(ctxDir, { recursive: true });
    writeFileSync(join(ctxDir, 'index.md'), `---
ctxify: "2.0"
totals: [invalid
---
# test
`);

    const result = validateShards(join(tmpDir, 'bad-fm'));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('frontmatter'))).toBe(true);
  });

  it('warns for unfilled TODOs', () => {
    const ctxDir = join(tmpDir, 'has-todos', '.ctxify');
    mkdirSync(ctxDir, { recursive: true });
    writeFileSync(join(ctxDir, 'index.md'), `---
ctxify: "2.0"
totals:
  repos: 0
  endpoints: 0
  shared_types: 0
  env_vars: 0
---
# test

<!-- TODO: Agent — fill this in -->
`);

    const result = validateShards(join(tmpDir, 'has-todos'));
    expect(result.warnings.some(w => w.includes('TODO'))).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/validate.test.ts`
Expected: FAIL — `validateShards` does not exist

**Step 3: Write implementation**

Create `src/core/validate.ts` (the validation logic) and `src/cli/commands/validate.ts` (the CLI command that calls it).

```typescript
// src/core/validate.ts
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateShards(workspaceRoot: string, outputDir?: string): ValidationResult;
```

Validation checks:
1. `index.md` exists and has valid YAML frontmatter (parse with `parseFrontmatter()`)
2. All `.md` files in `.ctxify/` — check that every opening segment marker `<!-- tag:... -->` has a matching `<!-- /tag -->`
3. Scan for `<!-- TODO:` markers — each is a warning (not an error)
4. If frontmatter has `totals`, check that endpoint count matches actual `<!-- endpoint:` segments found across endpoint shards

The CLI command (`src/cli/commands/validate.ts`) wraps this:
```typescript
export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Validate structural integrity of .ctxify shards')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { dir?: string }) => {
      // Call validateShards, output JSON result
    });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/validate.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/validate.ts src/cli/commands/validate.ts test/unit/validate.test.ts
git commit -m "feat: add validate command — structural integrity checker"
```

---

### Task 4: Rewrite `src/cli/commands/init.ts`

Replace the pipeline-based init with the scaffolder. Non-interactive, flag-driven.

**Files:**
- Modify: `src/cli/commands/init.ts`
- Create: `test/integration/init.test.ts`

**Step 1: Write the failing test**

```typescript
// test/integration/init.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';

const CLI_PATH = join(process.cwd(), 'dist', 'bin', 'ctxify.js');

function run(args: string[], cwd: string): string {
  return execFileSync('node', [CLI_PATH, ...args], { cwd, encoding: 'utf-8', timeout: 10000 });
}

describe('ctxify init (scaffolding)', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxify-init-'));
  });

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds single-repo workspace', () => {
    const ws = join(tmpDir, 'single');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'package.json'), JSON.stringify({
      name: 'my-app',
      description: 'Test app',
      dependencies: { hono: '4.0.0' },
      devDependencies: { typescript: '5.6.0' },
      scripts: { dev: 'tsx watch', build: 'tsc' },
    }));

    const output = run(['init'], ws);
    const result = JSON.parse(output);
    expect(result.status).toBe('initialized');

    // Check scaffolded files exist
    expect(existsSync(join(ws, '.ctxify', 'index.md'))).toBe(true);
    expect(existsSync(join(ws, '.ctxify', 'repos', 'single.md'))).toBe(true);
    expect(existsSync(join(ws, '.ctxify', '_analysis.md'))).toBe(true);

    // Check index.md frontmatter
    const indexContent = readFileSync(join(ws, '.ctxify', 'index.md'), 'utf-8');
    const fm = parseFrontmatter(indexContent);
    expect(fm).not.toBeNull();
    expect(fm!.ctxify).toBe('2.0');

    // Check _analysis.md exists and has content
    const analysis = readFileSync(join(ws, '.ctxify', '_analysis.md'), 'utf-8');
    expect(analysis).toContain('single');
  });

  it('scaffolds multi-repo workspace with --repos', () => {
    const ws = join(tmpDir, 'multi');
    mkdirSync(ws, { recursive: true });
    const apiDir = join(ws, 'api');
    const webDir = join(ws, 'web');
    mkdirSync(apiDir, { recursive: true });
    mkdirSync(webDir, { recursive: true });
    writeFileSync(join(apiDir, 'package.json'), JSON.stringify({
      name: 'api', dependencies: { hono: '4.0.0' }, devDependencies: { typescript: '5.0.0' },
    }));
    writeFileSync(join(webDir, 'package.json'), JSON.stringify({
      name: 'web', dependencies: { react: '18.0.0' }, devDependencies: { typescript: '5.0.0' },
    }));

    const output = run(['init', '--repos', './api', './web'], ws);
    const result = JSON.parse(output);
    expect(result.status).toBe('initialized');
    expect(result.repos).toEqual(['api', 'web']);

    expect(existsSync(join(ws, '.ctxify', 'repos', 'api.md'))).toBe(true);
    expect(existsSync(join(ws, '.ctxify', 'repos', 'web.md'))).toBe(true);
    expect(existsSync(join(ws, '.ctxify', 'endpoints', 'api.md'))).toBe(true);
    expect(existsSync(join(ws, '.ctxify', 'endpoints', 'web.md'))).toBe(true);
    expect(existsSync(join(ws, '.ctxify', 'types', 'shared.md'))).toBe(true);
    expect(existsSync(join(ws, '.ctxify', 'env', 'all.md'))).toBe(true);
    expect(existsSync(join(ws, '.ctxify', 'topology', 'graph.md'))).toBe(true);

    // ctx.yaml created
    expect(existsSync(join(ws, 'ctx.yaml'))).toBe(true);
  });

  it('refuses to overwrite without --force', () => {
    const ws = join(tmpDir, 'existing');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'package.json'), JSON.stringify({ name: 'existing' }));
    writeFileSync(join(ws, 'ctx.yaml'), 'version: "1"');

    try {
      run(['init'], ws);
      expect.unreachable('should have thrown');
    } catch (err: any) {
      expect(err.status).not.toBe(0);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run test/integration/init.test.ts`
Expected: FAIL — old init runs pipeline, doesn't scaffold templates

**Step 3: Rewrite `src/cli/commands/init.ts`**

Replace the entire file. The new init:

1. Parse CLI: `init [dir]` with `--repos <paths...>`, `--mono`, `--force`
2. Determine mode:
   - `--repos` → `multi-repo`, create ctx.yaml with listed repos
   - `--mono` → `mono-repo`, use `detectMonoRepo()` from `src/utils/monorepo.ts`
   - Default → `autoDetectMode()` from `src/cli/prompts.ts` (keep that function, it's non-interactive)
3. For each repo: call `parseRepoManifest()` from `src/core/manifest.ts`
4. Generate templates using functions from `src/templates/`
5. Write all files to `.ctxify/`
6. Optionally get git SHA per repo with `getHeadSha()` from `src/utils/git.ts`
7. Ensure .gitignore covers `.ctxify/`
8. Output JSON summary

Remove ALL imports of passes, pipeline, cache, differ, PassRegistry. The only external deps are: config.ts, manifest.ts, templates, git.ts, monorepo.ts, fs.ts.

```typescript
import type { Command } from 'commander';
import { resolve, join, basename } from 'node:path';
import { existsSync, writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { generateDefaultConfig, serializeConfig } from '../../core/config.js';
import type { RepoEntry, OperatingMode } from '../../core/config.js';
import { parseRepoManifest } from '../../core/manifest.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import { autoDetectMode } from '../prompts.js';
import { findGitRoots } from '../../utils/git.js';
import { readJsonFile } from '../../utils/fs.js';
import { getHeadSha } from '../../utils/git.js';
import type { RepoTemplateData } from '../../templates/index-md.js';

import { generateIndexTemplate } from '../../templates/index-md.js';
import { generateRepoTemplate } from '../../templates/repo.js';
import { generateEndpointsTemplate } from '../../templates/endpoints.js';
import { generateTypesTemplate } from '../../templates/types.js';
import { generateEnvTemplate } from '../../templates/env.js';
import { generateTopologyTemplate } from '../../templates/topology.js';
import { generateSchemasTemplate } from '../../templates/schemas.js';
import { generateQuestionsTemplate } from '../../templates/questions.js';
import { generateAnalysisChecklist } from '../../templates/analysis.js';
```

**Step 4: Build and run test to verify it passes**

Run: `npm run build && npx vitest run test/integration/init.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/commands/init.ts test/integration/init.test.ts
git commit -m "feat: rewrite init as scaffolder — no more pipeline/regex passes"
```

---

### Task 5: Simplify `src/cli/commands/status.ts`

Remove pipeline, cache, differ dependencies. Status just checks what files exist and whether they have TODOs.

**Files:**
- Modify: `src/cli/commands/status.ts`

**Step 1: Write the failing test**

Add a test to `test/integration/init.test.ts`:

```typescript
it('status reports scaffolded workspace', () => {
  // Use the 'single' workspace from the earlier test
  const ws = join(tmpDir, 'single');
  const output = run(['status'], ws);
  const result = JSON.parse(output);
  expect(result.index_exists).toBe(true);
  expect(result.repos).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run test/integration/init.test.ts`
Expected: FAIL — old status imports pipeline/cache/differ which may break after init changes

**Step 3: Rewrite status.ts**

Simple implementation:
- Check if `.ctxify/index.md` exists
- Check if `ctx.yaml` exists and load it
- For each expected shard directory: check existence
- Scan all `.md` files for `<!-- TODO:` markers
- Report: repos, which shards exist, number of TODOs remaining

No imports of pipeline, cache, differ, pass-registry, or any passes.

```typescript
import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Report workspace context status — what is filled vs pending')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { dir?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');
      // Check config, index, shard dirs, count TODOs
      // Output JSON
    });
}
```

**Step 4: Build and run test to verify it passes**

Run: `npm run build && npx vitest run test/integration/init.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/commands/status.ts
git commit -m "refactor: simplify status command — remove pipeline/cache dependencies"
```

---

### Task 6: Update CLI entry point + register validate command

**Files:**
- Modify: `bin/ctxify.ts`

**Step 1: Update bin/ctxify.ts**

Remove imports/registrations for: `scan`, `query`, `add-repo` (add-repo relies on the old workflow).
Add import/registration for: `validate`.
Update description.

```typescript
import { Command } from 'commander';
import { registerInitCommand } from '../src/cli/commands/init.js';
import { registerStatusCommand } from '../src/cli/commands/status.js';
import { registerValidateCommand } from '../src/cli/commands/validate.js';
import { registerBranchCommand } from '../src/cli/commands/branch.js';
import { registerCommitCommand } from '../src/cli/commands/commit.js';

const program = new Command();

program
  .name('ctxify')
  .description('Context layer for AI coding agents — a turbocharged CLAUDE.md for multi-repo workspaces')
  .version('2.0.0');

registerInitCommand(program);
registerStatusCommand(program);
registerValidateCommand(program);
registerBranchCommand(program);
registerCommitCommand(program);

program.parse();
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build (may have warnings about unused files, but no errors)

**Step 3: Commit**

```bash
git add bin/ctxify.ts
git commit -m "refactor: update CLI — remove scan/query, add validate"
```

---

### Task 7: Delete dead code

Remove everything that's no longer referenced.

**Files to delete:**
- `src/passes/01-repo-detection.ts`
- `src/passes/02-manifest-parsing.ts`
- `src/passes/03-structure-mapping.ts`
- `src/passes/04-api-discovery.ts`
- `src/passes/05-type-extraction.ts`
- `src/passes/06-env-scanning.ts`
- `src/passes/07-relationship-inference.ts`
- `src/passes/08-convention-detection.ts`
- `src/passes/types.ts`
- `src/renderers/index-md.ts`
- `src/renderers/shard-endpoints.ts`
- `src/renderers/shard-env.ts`
- `src/renderers/shard-questions.ts`
- `src/renderers/shard-repos.ts`
- `src/renderers/shard-schemas.ts`
- `src/renderers/shard-topology.ts`
- `src/renderers/shard-types.ts`
- `src/renderers/types.ts`
- `src/core/pipeline.ts`
- `src/core/cache.ts`
- `src/core/differ.ts`
- `src/core/pass-registry.ts`
- `src/core/shard-writer.ts`
- `src/cli/commands/scan.ts`
- `src/cli/commands/query.ts`
- `src/cli/commands/add-repo.ts`
- `src/cli/prompts.ts` (move `autoDetectMode` to its own file first — see below)
- `src/utils/regex-patterns.ts`
- `src/utils/hash.ts` (only used by cache)

**Before deleting `src/cli/prompts.ts`:** The `autoDetectMode()` function is still needed by init.ts. Move it to `src/core/detect.ts`:

```typescript
// src/core/detect.ts
import { resolve } from 'node:path';
import type { OperatingMode } from './config.js';
import { detectMonoRepo } from '../utils/monorepo.js';
import { findGitRoots } from '../utils/git.js';

export function autoDetectMode(dir: string): { mode: OperatingMode } {
  const monoDetection = detectMonoRepo(dir);
  if (monoDetection.detected) return { mode: 'mono-repo' };

  const gitRoots = findGitRoots(dir, 3);
  const dirAbs = resolve(dir);
  const subRepos = gitRoots.filter((root) => resolve(root) !== dirAbs);
  if (subRepos.length >= 2) return { mode: 'multi-repo' };

  return { mode: 'single-repo' };
}
```

Then update init.ts to import from `../../core/detect.js` instead of `../prompts.js`.

**Step 1: Move autoDetectMode**

```bash
# Create detect.ts, update init.ts import, then delete prompts.ts
```

**Step 2: Delete all dead files**

```bash
rm -rf src/passes/
rm -rf src/renderers/
rm src/core/pipeline.ts src/core/cache.ts src/core/differ.ts src/core/pass-registry.ts src/core/shard-writer.ts
rm src/cli/commands/scan.ts src/cli/commands/query.ts src/cli/commands/add-repo.ts
rm src/cli/prompts.ts
rm src/utils/regex-patterns.ts src/utils/hash.ts
```

**Step 3: Build to verify nothing is broken**

Run: `npm run build`
Expected: Clean compile. If errors, fix any remaining imports.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove all regex passes, renderers, pipeline, and dead code"
```

---

### Task 8: Update `src/index.ts` public API

**Files:**
- Modify: `src/index.ts`

**Step 1: Rewrite exports**

```typescript
// Config
export type {
  CtxConfig,
  RepoEntry,
  Relationship,
  ContextOptions,
  OperatingMode,
  MonoRepoOptions,
} from './core/config.js';

export { loadConfig, generateDefaultConfig, serializeConfig } from './core/config.js';

// Manifest parsing
export type { ManifestData } from './core/manifest.js';
export { parseRepoManifest } from './core/manifest.js';

// Validation
export type { ValidationResult } from './core/validate.js';
export { validateShards } from './core/validate.js';

// Detection
export { autoDetectMode } from './core/detect.js';

// Utilities
export { parseFrontmatter } from './utils/frontmatter.js';
export { extractSegments } from './utils/segments.js';
```

**Step 2: Build**

Run: `npm run build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "refactor: update public API exports for agent-native architecture"
```

---

### Task 9: Clean up and fix tests

Delete tests for removed code, ensure remaining tests pass.

**Files to delete:**
- `test/unit/shard-renderers.test.ts` (tests deleted renderers)
- `test/unit/pipeline.test.ts` (tests deleted pipeline)
- `test/unit/pipeline-parallel.test.ts` (tests deleted pipeline)
- `test/unit/pass-registry.test.ts` (tests deleted pass registry)
- `test/integration/scan.test.ts` (tests deleted scan command)

**Files to keep (may need minor fixes):**
- `test/unit/config.test.ts`
- `test/unit/context.test.ts`
- `test/unit/hash.test.ts` — DELETE (hash.ts is gone)
- `test/unit/monorepo-detection.test.ts`
- `test/unit/git-mutate.test.ts`
- `test/unit/query.test.ts` — KEEP only the `extractSegments` and `parseFrontmatter` tests. Delete the `shard file reading` tests that test the old format.
- `test/integration/git-commands.test.ts`

**Step 1: Delete dead test files**

```bash
rm test/unit/shard-renderers.test.ts
rm test/unit/pipeline.test.ts
rm test/unit/pipeline-parallel.test.ts
rm test/unit/pass-registry.test.ts
rm test/unit/hash.test.ts
rm test/integration/scan.test.ts
```

**Step 2: Update `test/unit/query.test.ts`**

Keep only the `segment extraction` and `frontmatter parsing` describe blocks. Remove the `query: shard file reading` block (it tests reading old-format shard files).

**Step 3: Check context.test.ts**

If `context.test.ts` imports from deleted modules or references fields that no longer exist, update it. The `WorkspaceContext` type may still exist — if so, keep the test. If we simplified the type, update the test.

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All remaining tests PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "test: remove dead tests, keep segment/frontmatter/config/git tests"
```

---

### Task 10: Simplify `src/core/context.ts`

The semantic types (ApiEndpoint, SharedType, EnvVar, etc.) are no longer used in code — the agent writes them directly to markdown. Keep the type definitions as documentation reference but simplify `WorkspaceContext` and `createWorkspaceContext`.

**Files:**
- Modify: `src/core/context.ts`

**Step 1: Review what's still imported**

Check if anything in the new codebase imports ApiEndpoint, SharedType, EnvVar, etc. If nothing does, either:
- (a) Remove them entirely, OR
- (b) Keep them as exported types (useful for agent tooling later) but remove them from WorkspaceContext

Recommended: Keep the types as standalone exports (they document the data model agents should write), but remove WorkspaceContext since init no longer builds one.

If init doesn't use `createWorkspaceContext()` anymore, remove it. The context types become reference documentation.

**Step 2: Build and test**

Run: `npm run build && npx vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/core/context.ts
git commit -m "refactor: simplify context.ts — remove unused WorkspaceContext factory"
```

---

### Task 11: Rewrite SKILL.md — the agent playbook

**Files:**
- Modify: `.claude/skills/ctxify/SKILL.md`

**Step 1: Write the new SKILL.md**

Structure:
1. **Detection** — check for `.ctxify/index.md`
2. **First-time setup** — identify repos, run `ctxify init`
3. **Reading context** — progressive disclosure from index to detail shards
4. **Filling shards** — per-shard semantic analysis guide with format expectations
5. **Updating** — incremental updates, `ctxify validate`

Key content for section 4 (filling shards):

For each shard type, describe:
- What to look for in source code
- Expected markdown format (frontmatter fields, segment marker syntax)
- Examples of well-formed output

Include the constraint: **All repos must be subdirectories of the workspace root. ctxify must run from the root.**

Remove all references to `ctxify scan`, `ctxify query`, `--json`, scan/query workflow.

**Step 2: Commit**

```bash
git add .claude/skills/ctxify/SKILL.md
git commit -m "docs: rewrite SKILL.md as agent playbook for scaffolder architecture"
```

---

### Task 12: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Update README**

- Update description to match agent-native architecture
- Document new CLI commands: `init`, `init --repos`, `init --mono`, `validate`, `status`, `branch`, `commit`
- Remove scan/query documentation
- Document the workflow: init → agent fills → validate
- Document directory structure with `.md` template files
- Note the constraint: all repos must be subdirectories

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for agent-native scaffolder architecture"
```

---

### Task 13: Final verification

**Step 1: Clean build**

```bash
rm -rf dist && npm run build
```
Expected: Clean compile, no errors

**Step 2: Run all tests**

```bash
npx vitest run
```
Expected: All tests pass

**Step 3: Self-init**

```bash
rm -rf .ctxify ctx.yaml
node dist/bin/ctxify.js init
```
Expected: scaffolds `.ctxify/` with templates, creates `ctx.yaml`

**Step 4: Inspect output**

```bash
cat .ctxify/index.md     # Has frontmatter, repo table, TODO markers
cat .ctxify/repos/ctxify.md  # Has deps, scripts, structure, TODO markers
cat .ctxify/_analysis.md     # Has checklist
```

**Step 5: Validate (should have TODO warnings)**

```bash
node dist/bin/ctxify.js validate
```
Expected: warnings about TODOs, no structural errors

**Step 6: Status check**

```bash
node dist/bin/ctxify.js status
```
Expected: JSON showing what exists and TODO count

**Step 7: Commit final state**

```bash
git add -A
git commit -m "chore: final verification — agent-native ctxify v2"
```
