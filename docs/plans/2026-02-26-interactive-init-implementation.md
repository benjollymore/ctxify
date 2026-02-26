# Interactive Init + Skill Installation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `ctxify init` interactive by default (guided setup with agent skill installation), while preserving existing flag-driven non-interactive behavior.

**Architecture:** Refactor `init.ts` to extract scaffolding into a reusable function. Add an interactive prompt flow using `@inquirer/prompts` that collects the same data flags would provide. Add a skill installer that copies SKILL.md with version stamping. Interactive mode triggers when no mode-determining flags are passed.

**Tech Stack:** TypeScript, @inquirer/prompts, Commander.js, Node.js fs

---

### Task 1: Install @inquirer/prompts dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `cd /Users/benjo/open-source/ctxify && npm install @inquirer/prompts`

Expected: package.json updated with `@inquirer/prompts` in `dependencies`.

**Step 2: Verify it installed correctly**

Run: `cd /Users/benjo/open-source/ctxify && node -e "import('@inquirer/prompts').then(m => console.log(Object.keys(m).join(', ')))"`

Expected: prints available exports including `select`, `confirm`, `checkbox`.

**Step 3: Commit**

```bash
cd /Users/benjo/open-source/ctxify
git add package.json package-lock.json
git commit -m "chore: add @inquirer/prompts dependency"
```

---

### Task 2: Refactor init.ts — extract scaffolding into reusable function

Extract the core scaffolding logic from the Commander action handler into a standalone `scaffoldWorkspace()` function that both interactive and flag-driven paths can call.

**Files:**
- Modify: `src/cli/commands/init.ts`
- Test: `test/unit/init-scaffold.test.ts` (new)

**Step 1: Write unit test for the extracted scaffoldWorkspace function**

Create `test/unit/init-scaffold.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldWorkspace } from '../../src/cli/commands/init.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ctxify-scaffold-'));
}

function createPackageJson(dir: string, name: string, extras: Record<string, unknown> = {}): void {
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...extras }, null, 2),
    'utf-8',
  );
}

describe('scaffoldWorkspace', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  it('scaffolds single-repo workspace', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app', { dependencies: { express: '^4.0.0' } });

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.status).toBe('initialized');
    expect(result.mode).toBe('single-repo');
    expect(existsSync(join(dir, 'ctx.yaml'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'index.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'my-app.md'))).toBe(true);
  });

  it('scaffolds multi-repo workspace', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const apiDir = join(dir, 'api');
    const webDir = join(dir, 'web');
    mkdirSync(apiDir);
    mkdirSync(webDir);
    createPackageJson(apiDir, 'api');
    createPackageJson(webDir, 'web');

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'multi-repo',
      repos: [{ path: 'api', name: 'api' }, { path: 'web', name: 'web' }],
    });

    expect(result.status).toBe('initialized');
    expect(result.mode).toBe('multi-repo');
    expect(result.repos).toEqual(['api', 'web']);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'api.md'))).toBe(true);
    expect(existsSync(join(dir, '.ctxify', 'repos', 'web.md'))).toBe(true);
  });

  it('returns skill_installed when agent option provided', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
      agent: 'claude',
    });

    expect(result.skill_installed).toBe('.claude/skills/ctxify/SKILL.md');
    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
  });

  it('does not install skill when agent is undefined', async () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    createPackageJson(dir, 'my-app');

    const result = await scaffoldWorkspace({
      workspaceRoot: dir,
      mode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.skill_installed).toBeUndefined();
    expect(existsSync(join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/benjo/open-source/ctxify && npx vitest run test/unit/init-scaffold.test.ts`

Expected: FAIL — `scaffoldWorkspace` is not exported from init.ts.

**Step 3: Refactor init.ts — extract scaffoldWorkspace**

In `src/cli/commands/init.ts`:

1. Define and export a `ScaffoldOptions` interface and `ScaffoldResult` interface:

```typescript
export type AgentType = 'claude';

export interface ScaffoldOptions {
  workspaceRoot: string;
  mode: OperatingMode;
  repos: RepoEntry[];
  monoRepoOptions?: MonoRepoOptions;
  force?: boolean;
  agent?: AgentType;
}

export interface ScaffoldResult {
  status: 'initialized';
  mode: OperatingMode;
  config: string;
  repos: string[];
  shards_written: boolean;
  skill_installed?: string;
}
```

2. Extract the scaffolding logic (lines ~93-195 of current init.ts) into:

```typescript
export async function scaffoldWorkspace(options: ScaffoldOptions): Promise<ScaffoldResult> {
  // ... existing scaffolding logic moved here ...
  // At the end, if options.agent is set, call installSkill()
}
```

3. The Commander action handler becomes a thin wrapper that resolves options from flags and calls `scaffoldWorkspace()`.

**Step 4: Run test to verify it passes**

Run: `cd /Users/benjo/open-source/ctxify && npx vitest run test/unit/init-scaffold.test.ts`

Expected: PASS (all 4 tests).

**Step 5: Run existing integration tests to verify no regression**

Run: `cd /Users/benjo/open-source/ctxify && npm run build && npx vitest run test/integration/init.test.ts`

Expected: All existing tests pass.

**Step 6: Commit**

```bash
cd /Users/benjo/open-source/ctxify
git add src/cli/commands/init.ts test/unit/init-scaffold.test.ts
git commit -m "refactor: extract scaffoldWorkspace from init command handler"
```

---

### Task 3: Implement skill installer

**Files:**
- Create: `src/cli/install-skill.ts`
- Test: `test/unit/install-skill.test.ts` (new)

**Step 1: Write failing tests for installSkill**

Create `test/unit/install-skill.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSkill, getSkillSourcePath } from '../../src/cli/install-skill.js';

describe('installSkill', () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ctxify-skill-'));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  it('copies SKILL.md to .claude/skills/ctxify/', () => {
    const workspace = makeTmpDir();
    const result = installSkill(workspace, 'claude');

    expect(result).toBe('.claude/skills/ctxify/SKILL.md');
    const installed = join(workspace, '.claude', 'skills', 'ctxify', 'SKILL.md');
    expect(existsSync(installed)).toBe(true);

    const content = readFileSync(installed, 'utf-8');
    expect(content).toContain('<!-- ctxify v');
    expect(content).toContain('name: ctxify');
  });

  it('prepends version comment to installed skill', () => {
    const workspace = makeTmpDir();
    installSkill(workspace, 'claude');

    const installed = join(workspace, '.claude', 'skills', 'ctxify', 'SKILL.md');
    const content = readFileSync(installed, 'utf-8');
    const firstLine = content.split('\n')[0];
    expect(firstLine).toMatch(/^<!-- ctxify v\d+\.\d+\.\d+ — do not edit manually, managed by ctxify init -->/);
  });

  it('creates intermediate directories', () => {
    const workspace = makeTmpDir();
    installSkill(workspace, 'claude');

    expect(existsSync(join(workspace, '.claude', 'skills', 'ctxify'))).toBe(true);
  });

  it('overwrites existing skill file', () => {
    const workspace = makeTmpDir();
    const skillDir = join(workspace, '.claude', 'skills', 'ctxify');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), 'old content', 'utf-8');

    installSkill(workspace, 'claude');

    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
    expect(content).not.toBe('old content');
    expect(content).toContain('name: ctxify');
  });

  it('getSkillSourcePath resolves to .claude/skills/ctxify/SKILL.md relative to package root', () => {
    const sourcePath = getSkillSourcePath();
    expect(existsSync(sourcePath)).toBe(true);
    expect(sourcePath).toContain('SKILL.md');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/benjo/open-source/ctxify && npx vitest run test/unit/install-skill.test.ts`

Expected: FAIL — module not found.

**Step 3: Implement install-skill.ts**

Create `src/cli/install-skill.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Map of agent types to their skill directory paths */
const AGENT_SKILL_PATHS: Record<string, string> = {
  claude: '.claude/skills/ctxify/SKILL.md',
};

/** Resolve the path to the source SKILL.md bundled with ctxify */
export function getSkillSourcePath(): string {
  // From src/cli/install-skill.ts → ../../.claude/skills/ctxify/SKILL.md
  // From dist/index.js → ../.claude/skills/ctxify/SKILL.md
  // We walk up from this file to find the package root by looking for package.json
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = join(dir, 'package.json');
      readFileSync(pkg, 'utf-8'); // throws if not found
      return join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md');
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error('Could not find ctxify package root');
}

/** Get ctxify version from package.json */
function getVersion(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    try {
      const content = readFileSync(join(dir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      return pkg.version || '0.0.0';
    } catch {
      dir = dirname(dir);
    }
  }
  return '0.0.0';
}

/**
 * Install the ctxify SKILL.md into the target workspace for the given agent.
 * Returns the relative path where the skill was installed.
 */
export function installSkill(workspaceRoot: string, agent: string): string {
  const relativePath = AGENT_SKILL_PATHS[agent];
  if (!relativePath) {
    throw new Error(`Unsupported agent: ${agent}. Supported: ${Object.keys(AGENT_SKILL_PATHS).join(', ')}`);
  }

  const sourcePath = getSkillSourcePath();
  const sourceContent = readFileSync(sourcePath, 'utf-8');
  const version = getVersion();

  const versionComment = `<!-- ctxify v${version} — do not edit manually, managed by ctxify init -->`;
  const installedContent = `${versionComment}\n${sourceContent}`;

  const destPath = join(workspaceRoot, relativePath);
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, installedContent, 'utf-8');

  return relativePath;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/benjo/open-source/ctxify && npx vitest run test/unit/install-skill.test.ts`

Expected: PASS (all 5 tests).

**Step 5: Commit**

```bash
cd /Users/benjo/open-source/ctxify
git add src/cli/install-skill.ts test/unit/install-skill.test.ts
git commit -m "feat: add skill installer for copying SKILL.md to agent workspaces"
```

---

### Task 4: Implement interactive prompt flow

**Files:**
- Create: `src/cli/commands/init-interactive.ts`
- Test: `test/unit/init-interactive.test.ts` (new)

**Step 1: Write tests for the interactive flow logic**

The interactive flow has testable decision logic (mode confirmation, repo filtering) separate from the actual prompts. Test the data-processing functions.

Create `test/unit/init-interactive.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveInteractiveOptions } from '../../src/cli/commands/init-interactive.js';
import type { ScaffoldOptions } from '../../src/cli/commands/init.js';

describe('resolveInteractiveOptions', () => {
  it('builds single-repo options from answers', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      agent: 'claude',
      confirmedMode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.mode).toBe('single-repo');
    expect(result.agent).toBe('claude');
    expect(result.repos).toEqual([{ path: '.', name: 'my-app' }]);
  });

  it('builds multi-repo options with selected repos', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      agent: 'claude',
      confirmedMode: 'multi-repo',
      repos: [
        { path: 'api', name: 'api' },
        { path: 'web', name: 'web' },
      ],
    });

    expect(result.mode).toBe('multi-repo');
    expect(result.repos).toHaveLength(2);
  });

  it('sets agent to undefined when skipped', () => {
    const result = resolveInteractiveOptions({
      workspaceRoot: '/tmp/test',
      confirmedMode: 'single-repo',
      repos: [{ path: '.', name: 'my-app' }],
    });

    expect(result.agent).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/benjo/open-source/ctxify && npx vitest run test/unit/init-interactive.test.ts`

Expected: FAIL — module not found.

**Step 3: Implement init-interactive.ts**

Create `src/cli/commands/init-interactive.ts`:

```typescript
import { select, confirm, checkbox } from '@inquirer/prompts';
import { basename } from 'node:path';
import { autoDetectMode } from '../../core/detect.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import type { OperatingMode, RepoEntry, MonoRepoOptions } from '../../core/config.js';
import type { AgentType, ScaffoldOptions } from './init.js';
import { findGitRoots } from '../../utils/git.js';
import { resolve, relative } from 'node:path';

export interface InteractiveAnswers {
  workspaceRoot: string;
  agent?: AgentType;
  confirmedMode: OperatingMode;
  repos: RepoEntry[];
  monoRepoOptions?: MonoRepoOptions;
}

/**
 * Pure function: convert interactive answers into ScaffoldOptions.
 * Separated from prompts for testability.
 */
export function resolveInteractiveOptions(answers: InteractiveAnswers): ScaffoldOptions {
  return {
    workspaceRoot: answers.workspaceRoot,
    mode: answers.confirmedMode,
    repos: answers.repos,
    monoRepoOptions: answers.monoRepoOptions,
    agent: answers.agent,
  };
}

/**
 * Run the interactive prompt flow. Collects all info needed for scaffolding.
 */
export async function runInteractiveFlow(workspaceRoot: string): Promise<ScaffoldOptions> {
  // Step 1: Agent selection
  const agentChoice = await select({
    message: 'Which AI agent do you use?',
    choices: [
      { name: 'Claude Code', value: 'claude' as const },
      { name: 'Skip (no skill installation)', value: 'skip' as const },
    ],
  });
  const agent: AgentType | undefined = agentChoice === 'skip' ? undefined : agentChoice;

  // Step 2: Auto-detect and confirm mode
  const detection = autoDetectMode(workspaceRoot);
  const modeConfirmed = await confirm({
    message: `Detected workspace mode: ${detection.mode}. Is this correct?`,
    default: true,
  });

  let mode: OperatingMode;
  if (modeConfirmed) {
    mode = detection.mode;
  } else {
    mode = await select({
      message: 'Select workspace mode:',
      choices: [
        { name: 'Single repo', value: 'single-repo' as const },
        { name: 'Multi-repo (separate repos in subdirectories)', value: 'multi-repo' as const },
        { name: 'Mono-repo (workspaces in one repo)', value: 'mono-repo' as const },
      ],
    });
  }

  // Step 3: Resolve repos based on mode
  let repos: RepoEntry[];
  let monoRepoOptions: MonoRepoOptions | undefined;

  if (mode === 'mono-repo') {
    const monoDetection = detectMonoRepo(workspaceRoot);
    monoRepoOptions = {
      manager: monoDetection.manager || undefined,
      packageGlobs: monoDetection.packageGlobs,
    };
    repos = monoDetection.packages.map((pkg) => ({
      path: pkg.relativePath,
      name: pkg.name,
      language: pkg.language,
      description: pkg.description,
    }));
  } else if (mode === 'single-repo') {
    repos = [{ path: '.', name: basename(workspaceRoot) }];
  } else {
    // multi-repo: discover and let user confirm
    const discovered = discoverMultiRepoEntries(workspaceRoot);

    if (discovered.length === 0) {
      console.log('No repositories found in subdirectories.');
      repos = [];
    } else {
      const includeAll = await confirm({
        message: `Found ${discovered.length} repositories:\n${discovered.map((r) => `  • ${r.name} (./${r.path})`).join('\n')}\nInclude all?`,
        default: true,
      });

      if (includeAll) {
        repos = discovered;
      } else {
        const selected = await checkbox({
          message: 'Select repositories to include:',
          choices: discovered.map((r) => ({
            name: `${r.name} (./${r.path})`,
            value: r,
            checked: true,
          })),
        });
        repos = selected;
      }
    }
  }

  return resolveInteractiveOptions({
    workspaceRoot,
    agent,
    confirmedMode: mode,
    repos,
    monoRepoOptions,
  });
}

function discoverMultiRepoEntries(workspaceRoot: string): RepoEntry[] {
  const gitRoots = findGitRoots(workspaceRoot, 3);
  const workspaceAbs = resolve(workspaceRoot);
  const subRepos = gitRoots.filter((root) => resolve(root) !== workspaceAbs);
  const repoRoots = subRepos.length > 0 ? subRepos : gitRoots;

  return repoRoots.map((root) => {
    const name = basename(root);
    const relPath = relative(workspaceRoot, root) || '.';
    return { path: relPath, name };
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/benjo/open-source/ctxify && npx vitest run test/unit/init-interactive.test.ts`

Expected: PASS (all 3 tests).

**Step 5: Commit**

```bash
cd /Users/benjo/open-source/ctxify
git add src/cli/commands/init-interactive.ts test/unit/init-interactive.test.ts
git commit -m "feat: add interactive prompt flow for init command"
```

---

### Task 5: Wire interactive flow into init command

Connect the interactive flow to the init command's action handler. When no mode-determining flags are passed, use the interactive flow. Otherwise, use the existing flag-driven path.

**Files:**
- Modify: `src/cli/commands/init.ts`

**Step 1: Update init.ts action handler**

At the top of the action handler, detect whether we're in interactive mode:

```typescript
const isInteractive = !options?.repos && !options?.mono;
```

If `isInteractive` and stdin is a TTY, call `runInteractiveFlow()` to get `ScaffoldOptions`, then call `scaffoldWorkspace()`.

If not interactive (flags present), follow the existing flag-resolution path, then call `scaffoldWorkspace()`.

Key change: the `ctx.yaml` existence check with `--force` should happen BEFORE the interactive flow starts (don't prompt the user if we're going to error anyway).

**Step 2: Build and run integration tests**

Run: `cd /Users/benjo/open-source/ctxify && npm run build && npx vitest run test/integration/init.test.ts`

Expected: All existing integration tests pass (they use `--repos` and other flags, so they hit the non-interactive path).

**Step 3: Manual test — run interactively against this workspace**

Run: `cd /Users/benjo/work/core && node /Users/benjo/open-source/ctxify/dist/bin/ctxify.js init`

Expected: interactive prompts appear, skill is installed, `.ctxify/` is scaffolded.

**Step 4: Commit**

```bash
cd /Users/benjo/open-source/ctxify
git add src/cli/commands/init.ts
git commit -m "feat: wire interactive flow into init command"
```

---

### Task 6: Update .npmignore to include skill files

The `.claude/` directory must be included in the npm package so that `installSkill` can find the source SKILL.md after npm installation.

**Files:**
- Modify: `.npmignore`

**Step 1: Verify .claude/ is not currently ignored**

Run: `cd /Users/benjo/open-source/ctxify && npm pack --dry-run 2>&1 | grep -i claude`

Expected: `.claude/skills/ctxify/SKILL.md` appears in the pack list (since .npmignore doesn't exclude it). If it doesn't appear, add it.

**Step 2: Commit if changes needed**

```bash
cd /Users/benjo/open-source/ctxify
git add .npmignore
git commit -m "chore: ensure skill files included in npm package"
```

---

### Task 7: Update CLAUDE.md and build

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md**

Add a note to the "Key patterns" section:

```markdown
### Interactive init (default)

When `ctxify init` is run without `--repos` or `--mono` flags, it enters interactive mode: prompts for agent type, confirms detected workspace mode, and optionally installs the agent skill file. Flags bypass interactivity for agent/CI use.

The skill installer (`src/cli/install-skill.ts`) copies `.claude/skills/ctxify/SKILL.md` with a version comment header to the target workspace.
```

Update the `init.ts` entry in the CLI commands table:

```markdown
| `init.ts` | Interactive scaffolder (default) or flag-driven. Detects repos, parses manifests, generates all templates, writes `.ctxify/`, optionally installs agent skill. Flags: `--repos`, `--mono`, `--force` |
```

**Step 2: Build**

Run: `cd /Users/benjo/open-source/ctxify && npm run build`

Expected: build succeeds, dist/ updated.

**Step 3: Commit**

```bash
cd /Users/benjo/open-source/ctxify
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with interactive init documentation"
```

---

### Task 8: End-to-end test — install ctxify into the core workspace

Run ctxify interactively against `/Users/benjo/work/core` to validate the full flow.

**Step 1: Build ctxify**

Run: `cd /Users/benjo/open-source/ctxify && npm run build`

**Step 2: Run init against core workspace**

Run: `cd /Users/benjo/work/core && node /Users/benjo/open-source/ctxify/dist/bin/ctxify.js init`

Expected flow:
1. Prompts for agent → select "Claude Code"
2. Detects multi-repo mode → confirm
3. Shows discovered repos (milkmoovement-fuse, express, api) → confirm all
4. Scaffolds `.ctxify/` with shards for all repos
5. Copies SKILL.md to `.claude/skills/ctxify/SKILL.md`
6. Prints JSON summary

**Step 3: Verify outputs**

Check that these exist:
- `/Users/benjo/work/core/.ctxify/index.md`
- `/Users/benjo/work/core/.ctxify/repos/milkmoovement-fuse.md`
- `/Users/benjo/work/core/.ctxify/repos/express.md`
- `/Users/benjo/work/core/.ctxify/repos/api.md`
- `/Users/benjo/work/core/.claude/skills/ctxify/SKILL.md`
- `/Users/benjo/work/core/ctx.yaml`

**Step 4: Verify skill is discoverable**

Start a new Claude Code session in `/Users/benjo/work/core` and check if the ctxify skill appears in available skills.
