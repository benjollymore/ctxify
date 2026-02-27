# Skill Scope Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make skill install location (workspace-local vs user-global) configurable per agent during `ctxify init`, tracked in ctx.yaml.

**Architecture:** Add `SkillScope` type and `SkillEntry` interface to config. Add `globalDestDir` to `AgentConfig`. Wire scope through interactive flow → `scaffoldWorkspace` → `installSkill` → ctx.yaml persistence. Upgrade reads scope back and reinstalls to the correct location.

**Tech Stack:** TypeScript, vitest, @inquirer/prompts, Commander.js

**Design doc:** `docs/plans/2026-02-27-skill-scope-design.md`

---

### Task 1: Config types — add SkillScope and SkillEntry

**Files:**
- Modify: `src/core/config.ts:1-47` (types) and `src/core/config.ts:210-224` (validateSkills)
- Modify: `src/index.ts` (export new types)
- Test: `test/unit/config.test.ts`

**Step 1: Write failing tests for new SkillEntry format**

Add to the `skills and install_method fields` describe block in `test/unit/config.test.ts`:

```typescript
it('roundtrips skills field with new SkillEntry format', () => {
  const repos = [{ path: '.', name: 'app' }];
  const config = generateDefaultConfig('/tmp/ws', repos, 'single-repo', undefined, undefined, {
    claude: { path: '.claude/skills/ctxify/SKILL.md', scope: 'workspace' },
  });

  const serialized = serializeConfig(config);
  const configPath = join(tmpDir, 'ctx-skills-entry.yaml');
  writeFileSync(configPath, serialized, 'utf-8');

  const loaded = loadConfig(configPath);
  expect(loaded.skills).toEqual({
    claude: { path: '.claude/skills/ctxify/SKILL.md', scope: 'workspace' },
  });
});

it('normalizes old string skills format to SkillEntry with scope workspace', () => {
  const yaml = `
version: "1"
workspace: /tmp/ws
skills:
  claude: ".claude/skills/ctxify/SKILL.md"
  codex: "AGENTS.md"
`;
  const configPath = join(tmpDir, 'ctx-old-skills.yaml');
  writeFileSync(configPath, yaml, 'utf-8');
  const config = loadConfig(configPath);
  expect(config.skills).toEqual({
    claude: { path: '.claude/skills/ctxify/SKILL.md', scope: 'workspace' },
    codex: { path: 'AGENTS.md', scope: 'workspace' },
  });
});

it('accepts global scope in SkillEntry', () => {
  const yaml = `
version: "1"
workspace: /tmp/ws
skills:
  claude:
    path: "~/.claude/skills/ctxify/SKILL.md"
    scope: global
`;
  const configPath = join(tmpDir, 'ctx-global-skill.yaml');
  writeFileSync(configPath, yaml, 'utf-8');
  const config = loadConfig(configPath);
  expect(config.skills!['claude']).toEqual({
    path: '~/.claude/skills/ctxify/SKILL.md',
    scope: 'global',
  });
});

it('rejects invalid scope value in SkillEntry', () => {
  const yaml = `
version: "1"
workspace: /tmp/ws
skills:
  claude:
    path: ".claude/skills/ctxify/SKILL.md"
    scope: "invalid"
`;
  const configPath = join(tmpDir, 'ctx-bad-scope.yaml');
  writeFileSync(configPath, yaml, 'utf-8');
  expect(() => loadConfig(configPath)).toThrow(ConfigError);
  expect(() => loadConfig(configPath)).toThrow(/scope/);
});

it('rejects SkillEntry missing path field', () => {
  const yaml = `
version: "1"
workspace: /tmp/ws
skills:
  claude:
    scope: workspace
`;
  const configPath = join(tmpDir, 'ctx-no-path.yaml');
  writeFileSync(configPath, yaml, 'utf-8');
  expect(() => loadConfig(configPath)).toThrow(ConfigError);
  expect(() => loadConfig(configPath)).toThrow(/path/);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/config.test.ts`
Expected: FAIL — `skills` type is still `Record<string, string>`

**Step 3: Implement SkillScope, SkillEntry, and update validateSkills**

In `src/core/config.ts`:

1. Add types after the existing `ContextOptions` interface (around line 35):

```typescript
export type SkillScope = 'workspace' | 'global';

export interface SkillEntry {
  path: string;
  scope: SkillScope;
}
```

2. Change `CtxConfig.skills` from `Record<string, string>` to `Record<string, SkillEntry>`.

3. Replace `validateSkills` to handle both old string format and new object format:

```typescript
function validateSkills(raw: unknown): Record<string, SkillEntry> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError('"skills" must be an object mapping agent names to paths or skill entries');
  }
  const o = raw as Record<string, unknown>;
  const result: Record<string, SkillEntry> = {};
  for (const [key, val] of Object.entries(o)) {
    if (typeof val === 'string') {
      // Backward compat: plain string → { path, scope: 'workspace' }
      result[key] = { path: val, scope: 'workspace' };
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const entry = val as Record<string, unknown>;
      if (typeof entry.path !== 'string') {
        throw new ConfigError(`skills.${key}.path must be a string`);
      }
      if (entry.scope !== 'workspace' && entry.scope !== 'global') {
        throw new ConfigError(
          `skills.${key}.scope must be "workspace" or "global" (got "${String(entry.scope)}")`,
        );
      }
      result[key] = { path: entry.path, scope: entry.scope };
    } else {
      throw new ConfigError(`skills.${key} must be a string or { path, scope } object`);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
```

4. Update `generateDefaultConfig` signature — the `skills` parameter type changes from `Record<string, string>` to `Record<string, SkillEntry>`.

5. Export `SkillScope` and `SkillEntry` from `src/index.ts`.

**Step 4: Fix the existing roundtrip test**

The existing test `'roundtrips skills field through serialize and load'` passes a `Record<string, string>` to `generateDefaultConfig`. Update it to use the new `SkillEntry` format:

```typescript
it('roundtrips skills field through serialize and load', () => {
  const repos = [{ path: '.', name: 'app' }];
  const config = generateDefaultConfig('/tmp/ws', repos, 'single-repo', undefined, undefined, {
    claude: { path: '.claude/skills/ctxify/SKILL.md', scope: 'workspace' },
  });

  const serialized = serializeConfig(config);
  const configPath = join(tmpDir, 'ctx-skills.yaml');
  writeFileSync(configPath, serialized, 'utf-8');

  const loaded = loadConfig(configPath);
  expect(loaded.skills).toEqual({
    claude: { path: '.claude/skills/ctxify/SKILL.md', scope: 'workspace' },
  });
});
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run test/unit/config.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/core/config.ts src/index.ts test/unit/config.test.ts
git commit -m "feat: add SkillScope and SkillEntry types with backward-compat validation"
```

---

### Task 2: installSkill — add scope parameter and globalDestDir

**Files:**
- Modify: `src/cli/install-skill.ts:8-57` (AgentConfig, AGENT_CONFIGS) and `src/cli/install-skill.ts:122-176` (installSkill)
- Test: `test/unit/install-skill.test.ts`

**Step 1: Write failing tests for global scope**

Add to the `installSkill` describe block in `test/unit/install-skill.test.ts`:

```typescript
import { homedir } from 'node:os';
import type { SkillScope } from '../../src/core/config.js';
```

```typescript
it('installs claude skill to global path when scope is global', () => {
  const dir = makeTmpDir();
  tmpDirs.push(dir);

  // Use a fake home dir to avoid polluting real home
  const fakeHome = makeTmpDir();
  tmpDirs.push(fakeHome);

  const relativePath = installSkill(dir, 'claude', 'global', fakeHome);

  // Returns path relative to home
  expect(relativePath).toContain('.claude/skills/ctxify/SKILL.md');
  const skillsDir = join(fakeHome, '.claude', 'skills');
  expect(existsSync(join(skillsDir, 'ctxify', 'SKILL.md'))).toBe(true);
  expect(existsSync(join(skillsDir, 'ctxify-reading-context', 'SKILL.md'))).toBe(true);
});

it('installs codex skill to global path when scope is global', () => {
  const dir = makeTmpDir();
  tmpDirs.push(dir);

  const fakeHome = makeTmpDir();
  tmpDirs.push(fakeHome);

  const relativePath = installSkill(dir, 'codex', 'global', fakeHome);

  expect(relativePath).toContain('.codex/AGENTS.md');
  expect(existsSync(join(fakeHome, '.codex', 'AGENTS.md'))).toBe(true);
});

it('workspace scope installs to workspaceRoot (unchanged behavior)', () => {
  const dir = makeTmpDir();
  tmpDirs.push(dir);

  const relativePath = installSkill(dir, 'claude', 'workspace');

  expect(relativePath).toBe('.claude/skills/ctxify/SKILL.md');
  expect(existsSync(join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
});

it('throws when global scope requested for agent without globalDestDir', () => {
  const dir = makeTmpDir();
  tmpDirs.push(dir);

  expect(() => installSkill(dir, 'cursor', 'global')).toThrow(/does not support global/);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/install-skill.test.ts`
Expected: FAIL — `installSkill` doesn't accept `scope` parameter

**Step 3: Implement globalDestDir and scope parameter**

In `src/cli/install-skill.ts`:

1. Import `SkillScope` and `homedir`:

```typescript
import { homedir } from 'node:os';
import type { SkillScope } from '../core/config.js';
```

2. Add `globalDestDir` to `AgentConfig` interface:

```typescript
interface AgentConfig {
  // ... existing fields
  globalDestDir?: string; // Path relative to home dir, e.g. '.claude/skills/ctxify'
}
```

3. Add `globalDestDir` to AGENT_CONFIGS for claude and codex:

```typescript
claude: {
  // ... existing fields
  globalDestDir: '.claude/skills/ctxify',
},
codex: {
  // ... existing fields
  globalDestDir: '.codex',
},
```

4. Update `installSkill` signature and resolve destDir based on scope:

```typescript
export function installSkill(
  workspaceRoot: string,
  agent: string,
  scope: SkillScope = 'workspace',
  homeDir?: string, // injectable for testing
): string {
  const config = AGENT_CONFIGS[agent];
  if (!config) {
    throw new Error(
      `Unsupported agent: ${agent}. Supported: ${Object.keys(AGENT_CONFIGS).join(', ')}`,
    );
  }

  if (scope === 'global' && !config.globalDestDir) {
    throw new Error(
      `Agent "${agent}" does not support global scope. Only agents with a known global path support it.`,
    );
  }

  const resolvedHome = homeDir ?? homedir();
  const baseDir = scope === 'global'
    ? join(resolvedHome, config.globalDestDir!)
    : join(workspaceRoot, config.destDir);
  const returnPrefix = scope === 'global'
    ? join('~', config.globalDestDir!)
    : config.destDir;

  // ... rest of function uses baseDir instead of destDir,
  //     and returnPrefix instead of config.destDir for return path
```

The key change: replace `const destDir = join(workspaceRoot, config.destDir)` with the resolved `baseDir`, and similarly for the satellite directory logic (use `dirname(baseDir)` instead of `dirname(destDir)`).

The return value uses `~` prefix for global paths so ctx.yaml stores a portable path.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/install-skill.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/cli/install-skill.ts test/unit/install-skill.test.ts
git commit -m "feat: add global scope support to installSkill with globalDestDir"
```

---

### Task 3: scaffoldWorkspace — wire agentScopes through

**Files:**
- Modify: `src/cli/commands/init.ts:19-57` (ScaffoldOptions, scaffoldWorkspace)
- Test: `test/unit/init-scaffold.test.ts`

**Step 1: Write failing tests**

Add to the `scaffoldWorkspace` describe block in `test/unit/init-scaffold.test.ts`:

```typescript
it('persists skill scope in ctx.yaml when agents have scopes', async () => {
  const dir = makeTmpDir();
  tmpDirs.push(dir);
  createPackageJson(dir, 'my-app');

  await scaffoldWorkspace({
    workspaceRoot: dir,
    mode: 'single-repo',
    repos: [{ path: '.', name: 'my-app' }],
    agents: ['claude', 'cursor'],
    agentScopes: { claude: 'workspace', cursor: 'workspace' },
  });

  const config = loadConfig(join(dir, 'ctx.yaml'));
  expect(config.skills!['claude']).toEqual({
    path: '.claude/skills/ctxify/SKILL.md',
    scope: 'workspace',
  });
  expect(config.skills!['cursor']).toEqual({
    path: '.cursor/rules/ctxify.md',
    scope: 'workspace',
  });
});

it('persists global scope for agent installed globally', async () => {
  const dir = makeTmpDir();
  tmpDirs.push(dir);
  createPackageJson(dir, 'my-app');

  const fakeHome = makeTmpDir();
  tmpDirs.push(fakeHome);

  await scaffoldWorkspace({
    workspaceRoot: dir,
    mode: 'single-repo',
    repos: [{ path: '.', name: 'my-app' }],
    agents: ['claude'],
    agentScopes: { claude: 'global' },
    homeDir: fakeHome,
  });

  const config = loadConfig(join(dir, 'ctx.yaml'));
  expect(config.skills!['claude'].scope).toBe('global');
  expect(config.skills!['claude'].path).toContain('~/.claude/skills/ctxify/SKILL.md');
});

it('defaults to workspace scope when agentScopes not provided', async () => {
  const dir = makeTmpDir();
  tmpDirs.push(dir);
  createPackageJson(dir, 'my-app');

  await scaffoldWorkspace({
    workspaceRoot: dir,
    mode: 'single-repo',
    repos: [{ path: '.', name: 'my-app' }],
    agents: ['claude'],
  });

  const config = loadConfig(join(dir, 'ctx.yaml'));
  expect(config.skills!['claude'].scope).toBe('workspace');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/init-scaffold.test.ts`
Expected: FAIL

**Step 3: Implement agentScopes in ScaffoldOptions and scaffoldWorkspace**

In `src/cli/commands/init.ts`:

1. Import `SkillScope` and `SkillEntry`:

```typescript
import type { RepoEntry, OperatingMode, MonoRepoOptions, SkillScope, SkillEntry } from '../../core/config.js';
```

2. Add to `ScaffoldOptions`:

```typescript
export interface ScaffoldOptions {
  // ... existing fields
  agentScopes?: Record<string, SkillScope>;
  homeDir?: string; // injectable for testing
}
```

3. Update the skills installation loop in `scaffoldWorkspace`:

```typescript
const skills_installed: string[] = [];
const skillsMap: Record<string, SkillEntry> = {};
if (options.agents) {
  for (const agent of options.agents) {
    const scope = options.agentScopes?.[agent] ?? 'workspace';
    const dest = installSkill(workspaceRoot, agent, scope, options.homeDir);
    skills_installed.push(dest);
    skillsMap[agent] = { path: dest, scope };
  }
}
```

4. Update the existing test `'persists skills map in ctx.yaml when agents installed'` to expect the new `SkillEntry` format:

```typescript
it('persists skills map in ctx.yaml when agents installed', async () => {
  const dir = makeTmpDir();
  tmpDirs.push(dir);
  createPackageJson(dir, 'my-app');

  await scaffoldWorkspace({
    workspaceRoot: dir,
    mode: 'single-repo',
    repos: [{ path: '.', name: 'my-app' }],
    agents: ['claude', 'codex'],
  });

  const config = loadConfig(join(dir, 'ctx.yaml'));
  expect(config.skills).toBeDefined();
  expect(config.skills!['claude']).toEqual({
    path: '.claude/skills/ctxify/SKILL.md',
    scope: 'workspace',
  });
  expect(config.skills!['codex']).toEqual({
    path: 'AGENTS.md',
    scope: 'workspace',
  });
});
```

5. Also update `'installs skills for multiple agents'` — the `result.skills_installed` array is unchanged (still strings), but the `next step hint` matching on line 240 may need attention since it compares against `join(c.destDir, c.primaryFilename)`. For global installs, the returned path uses `~/...` prefix. Update the hint derivation to handle both formats:

```typescript
const hints = Object.values(AGENT_CONFIGS)
  .filter((c) => {
    const workspacePath = join(c.destDir, c.primaryFilename);
    const globalPath = c.globalDestDir ? join('~', c.globalDestDir, c.primaryFilename) : null;
    return result.skills_installed!.some(
      (p) => p === workspacePath || p === globalPath,
    );
  })
  .map((c) => c.nextStepHint);
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/init-scaffold.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/cli/commands/init.ts test/unit/init-scaffold.test.ts
git commit -m "feat: wire agentScopes through scaffoldWorkspace to installSkill"
```

---

### Task 4: Interactive flow — scope prompt per agent

**Files:**
- Modify: `src/cli/commands/init-interactive.ts:1-124`
- Test: `test/unit/init-interactive.test.ts`

**Step 1: Write failing tests**

Add to `test/unit/init-interactive.test.ts`:

```typescript
import type { SkillScope } from '../../src/core/config.js';

it('passes through agentScopes', () => {
  const result = resolveInteractiveOptions({
    workspaceRoot: '/tmp/test',
    agents: ['claude', 'cursor'],
    agentScopes: { claude: 'global', cursor: 'workspace' },
    confirmedMode: 'single-repo',
    repos: [{ path: '.', name: 'my-app' }],
  });

  expect(result.agentScopes).toEqual({ claude: 'global', cursor: 'workspace' });
});

it('sets agentScopes to undefined when not provided', () => {
  const result = resolveInteractiveOptions({
    workspaceRoot: '/tmp/test',
    agents: ['claude'],
    confirmedMode: 'single-repo',
    repos: [{ path: '.', name: 'my-app' }],
  });

  expect(result.agentScopes).toBeUndefined();
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/init-interactive.test.ts`
Expected: FAIL — `agentScopes` not in `InteractiveAnswers`

**Step 3: Implement scope prompts in interactive flow**

In `src/cli/commands/init-interactive.ts`:

1. Import `SkillScope` and `AGENT_CONFIGS`:

```typescript
import type { SkillScope } from '../../core/config.js';
```

2. Add `agentScopes` to `InteractiveAnswers`:

```typescript
export interface InteractiveAnswers {
  // ... existing fields
  agentScopes?: Record<string, SkillScope>;
}
```

3. Add `agentScopes` passthrough in `resolveInteractiveOptions`:

```typescript
export function resolveInteractiveOptions(answers: InteractiveAnswers): ScaffoldOptions {
  return {
    workspaceRoot: answers.workspaceRoot,
    mode: answers.confirmedMode,
    repos: answers.repos,
    monoRepoOptions: answers.monoRepoOptions,
    agents: answers.agents,
    agentScopes: answers.agentScopes,
  };
}
```

4. Add scope prompts in `runInteractiveFlow` after agent selection (between step 1 and step 2):

```typescript
// Step 1.5: Scope selection for agents that support global
let agentScopes: Record<string, SkillScope> | undefined;
if (agents && agents.length > 0) {
  const scopeMap: Record<string, SkillScope> = {};
  for (const agent of agents) {
    const config = AGENT_CONFIGS[agent];
    if (config.globalDestDir) {
      const scope = await select<SkillScope>({
        message: `Where should ${config.displayName} skills be installed?`,
        choices: [
          {
            name: `This workspace (.${config.destDir.startsWith('.') ? config.destDir.slice(1) : '/' + config.destDir}/)`,
            value: 'workspace' as const,
          },
          {
            name: `Global (~/${config.globalDestDir}/ — available in all projects)`,
            value: 'global' as const,
          },
        ],
      });
      scopeMap[agent] = scope;
    } else {
      scopeMap[agent] = 'workspace';
    }
  }
  agentScopes = scopeMap;
}
```

Then pass `agentScopes` in the return call to `resolveInteractiveOptions`.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/init-interactive.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/cli/commands/init-interactive.ts test/unit/init-interactive.test.ts
git commit -m "feat: add per-agent scope prompt in interactive init flow"
```

---

### Task 5: Upgrade — read scope from SkillEntry

**Files:**
- Modify: `src/cli/commands/upgrade.ts:24-107`
- Test: `test/unit/upgrade.test.ts`

**Step 1: Write failing tests**

Add to the `runUpgrade` describe block in `test/unit/upgrade.test.ts`:

```typescript
it('reinstalls skills with correct scope from new SkillEntry format', async () => {
  const fakeHome = makeTmpDir();
  writeCtxYaml(tmpDir, {
    install_method: 'global',
    skills: {
      claude: { path: '~/.claude/skills/ctxify/SKILL.md', scope: 'global' },
    },
  });

  const calls: string[][] = [];
  const result = await runUpgrade(tmpDir, {
    execFn: (args) => calls.push(args),
    homeDir: fakeHome,
  });

  expect(result.status).toBe('upgraded');
  expect(result.skills_reinstalled.length).toBeGreaterThan(0);
  expect(existsSync(join(fakeHome, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);

  rmSync(fakeHome, { recursive: true, force: true });
});

it('backward compat: reinstalls old string skills format as workspace scope', async () => {
  writeCtxYaml(tmpDir, {
    install_method: 'global',
    skills: { claude: '.claude/skills/ctxify/SKILL.md' },
  });
  mkdirSync(join(tmpDir, '.claude', 'skills', 'ctxify'), { recursive: true });

  const calls: string[][] = [];
  const result = await runUpgrade(tmpDir, {
    execFn: (args) => calls.push(args),
  });

  expect(result.status).toBe('upgraded');
  expect(result.skills_reinstalled).toContain('.claude/skills/ctxify/SKILL.md');
  expect(existsSync(join(tmpDir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/upgrade.test.ts`
Expected: FAIL — `runUpgrade` reads `skills` as `Record<string, string>`

**Step 3: Implement scope-aware upgrade**

In `src/cli/commands/upgrade.ts`:

1. Import `SkillEntry` and `SkillScope`:

```typescript
import type { SkillEntry, SkillScope } from '../../core/config.js';
```

2. Add `homeDir` to `UpgradeOptions`:

```typescript
export interface UpgradeOptions {
  dryRun?: boolean;
  execFn?: (args: string[], opts?: { cwd?: string }) => void;
  homeDir?: string; // injectable for testing
}
```

3. Update the skills reading and reinstall loop:

```typescript
let skillsMap: Record<string, SkillEntry> = {};

if (existsSync(configPath)) {
  try {
    const config = loadConfig(configPath);
    if (config.install_method) {
      install_method = config.install_method;
    }
    if (config.skills) {
      skillsMap = config.skills;
    }
  } catch {
    // If config is malformed, proceed with defaults
  }
}

// ...

// Reinstall skills
const skills_reinstalled: string[] = [];
for (const [agent, entry] of Object.entries(skillsMap)) {
  try {
    const dest = installSkill(workspaceRoot, agent, entry.scope, opts.homeDir);
    skills_reinstalled.push(dest);
  } catch {
    // Non-fatal
  }
}
```

Note: The backward compat is already handled by `loadConfig` → `validateSkills`, which normalizes old strings to `{ path, scope: 'workspace' }`. So `entry.scope` will always be defined.

4. Update the existing test `'reinstalls skills listed in ctx.yaml'` — it currently writes the old string format. Since `loadConfig` now normalizes old strings, this test still works. But update the `writeCtxYaml` calls in this test to use the new format for clarity:

```typescript
it('reinstalls skills listed in ctx.yaml', async () => {
  writeCtxYaml(tmpDir, {
    install_method: 'global',
    skills: {
      claude: { path: '.claude/skills/ctxify/SKILL.md', scope: 'workspace' },
    },
  });
  mkdirSync(join(tmpDir, '.claude', 'skills', 'ctxify'), { recursive: true });

  const calls: string[][] = [];
  const result = await runUpgrade(tmpDir, {
    execFn: (args) => calls.push(args),
  });

  expect(result.status).toBe('upgraded');
  expect(result.skills_reinstalled).toContain('.claude/skills/ctxify/SKILL.md');
  expect(existsSync(join(tmpDir, '.claude', 'skills', 'ctxify', 'SKILL.md'))).toBe(true);
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/upgrade.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/cli/commands/upgrade.ts test/unit/upgrade.test.ts
git commit -m "feat: upgrade reads scope from SkillEntry for correct reinstall location"
```

---

### Task 6: Full test suite green + typecheck

**Files:**
- All modified files from Tasks 1-5

**Step 1: Run full test suite**

Run: `npm test`
Expected: All 204+ tests PASS (new tests added too)

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Fix any failures**

If any tests fail or type errors appear, fix them before committing.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test/typecheck issues from skill scope feature"
```

---

### Task 7: Update CLAUDE.md and README

**Files:**
- Modify: `CLAUDE.md` — update SkillScope/SkillEntry in source map, update config.ts description, update init-interactive.ts description
- Modify: `README.md` — update skill installation section if it mentions install paths

**Step 1: Update CLAUDE.md**

Update the `config.ts` row to mention `SkillScope`, `SkillEntry`. Update the `ScaffoldOptions` description to mention `agentScopes`. Update the `install-skill.ts` description to mention `globalDestDir` and `scope` parameter.

**Step 2: Update README.md**

If the README mentions skill installation behavior, add a note that interactive init prompts for install scope (workspace vs global) for agents that support it.

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update CLAUDE.md and README for skill scope feature"
```
