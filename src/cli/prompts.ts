import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync } from 'node:fs';
import { resolve, join, basename, relative } from 'node:path';
import type { OperatingMode, Relationship, MonoRepoOptions } from '../core/config.js';
import { detectMonoRepo } from '../utils/monorepo.js';
import { findGitRoots } from '../utils/git.js';
import { readJsonFile } from '../utils/fs.js';

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

export interface SingleRepoResult {
  dir: string;
}

export async function promptSingleRepo(defaultDir: string): Promise<SingleRepoResult> {
  const answer = await ask(`Repository directory [${defaultDir}]: `);
  const dir = answer || defaultDir;
  const resolved = resolve(dir);

  if (!existsSync(resolved)) {
    console.log(`Warning: directory ${resolved} does not exist`);
  } else if (!existsSync(join(resolved, '.git'))) {
    console.log(`Warning: no .git found in ${resolved}`);
  }

  return { dir: resolved };
}

export interface MultiRepoResult {
  root: string;
  repoPaths: string[];
}

export async function promptMultiRepo(defaultRoot: string): Promise<MultiRepoResult> {
  const rootAnswer = await ask(`Workspace root directory [${defaultRoot}]: `);
  const root = resolve(rootAnswer || defaultRoot);

  // Auto-detect existing git repos
  const detected = findGitRoots(root, 3);
  if (detected.length > 0) {
    console.log(`\nDetected ${detected.length} git repos:`);
    for (const r of detected) {
      console.log(`  - ${r}`);
    }
    const useDetected = await ask('Use detected repos? [Y/n]: ');
    if (!useDetected || useDetected.toLowerCase() === 'y') {
      return { root, repoPaths: detected };
    }
  }

  const repoPaths: string[] = [];
  console.log('\nAdd repository paths (empty line to finish, minimum 2):');

  while (true) {
    const path = await ask(`  repo path: `);
    if (!path) {
      if (repoPaths.length >= 2) break;
      console.log(`  Need at least 2 repos (have ${repoPaths.length})`);
      continue;
    }
    const resolved = resolve(root, path);
    if (!existsSync(resolved)) {
      console.log(`  Warning: ${resolved} does not exist`);
    }
    repoPaths.push(resolved);
  }

  return { root, repoPaths };
}

export interface MonoRepoResult {
  dir: string;
  manager: string | null;
  packageGlobs: string[];
  packageNames: string[];
}

export async function promptMonoRepo(defaultDir: string): Promise<MonoRepoResult> {
  const answer = await ask(`Monorepo root directory [${defaultDir}]: `);
  const dir = resolve(answer || defaultDir);

  const detection = detectMonoRepo(dir);

  if (detection.detected) {
    console.log(`\nDetected ${detection.manager || 'unknown'} monorepo with ${detection.packages.length} packages:`);
    for (const pkg of detection.packages) {
      console.log(`  - ${pkg.name} (${pkg.relativePath})`);
    }

    const confirm = await ask('Use detected configuration? [Y/n]: ');
    if (!confirm || confirm.toLowerCase() === 'y') {
      return {
        dir,
        manager: detection.manager,
        packageGlobs: detection.packageGlobs,
        packageNames: detection.packages.map((p) => p.name),
      };
    }
  } else {
    console.log('\nNo monorepo packages detected automatically.');
  }

  const globsAnswer = await ask('Package globs (comma-separated, e.g. "packages/*,apps/*"): ');
  const packageGlobs = globsAnswer.split(',').map((g) => g.trim()).filter(Boolean);

  return {
    dir,
    manager: detection.manager,
    packageGlobs,
    packageNames: detection.packages.map((p) => p.name),
  };
}

export interface ModeDetectionResult {
  mode: OperatingMode;
  manager?: string | null;
  packageGlobs?: string[];
}

export function autoDetectMode(dir: string): ModeDetectionResult {
  // 1. Check monorepo indicators first
  const monoDetection = detectMonoRepo(dir);
  if (monoDetection.detected) {
    return {
      mode: 'mono-repo',
      manager: monoDetection.manager,
      packageGlobs: monoDetection.packageGlobs,
    };
  }

  // 2. Check for multiple git roots
  const gitRoots = findGitRoots(dir, 3);
  const dirAbs = resolve(dir);
  const subRepos = gitRoots.filter((root) => resolve(root) !== dirAbs);
  if (subRepos.length >= 2) {
    return { mode: 'multi-repo' };
  }

  // 3. Fallback: single-repo
  return { mode: 'single-repo' };
}

export interface InterviewResult {
  mode: OperatingMode;
  repos: { path: string; name: string; language?: string; description?: string }[];
  relationships: Relationship[];
  monoRepoOptions?: MonoRepoOptions;
}

export async function runInteractiveInterview(workspaceRoot: string): Promise<InterviewResult> {
  console.log('\nctxify — context compiler for AI coding agents.\n');

  // Step 1: Auto-detect what's here
  const detection = autoDetectMode(workspaceRoot);
  const relationships: Relationship[] = [];

  // Step 2: Show detection result and branch
  if (detection.mode === 'mono-repo') {
    const monoDetection = detectMonoRepo(workspaceRoot);
    console.log(`Detected ${monoDetection.manager || 'unknown'} monorepo with ${monoDetection.packages.length} packages:`);
    for (const pkg of monoDetection.packages) {
      console.log(`  - ${pkg.name} (${pkg.relativePath})`);
    }

    const confirm = await ask('\nUse detected configuration? [Y/n]: ');
    if (!confirm || confirm.toLowerCase() === 'y') {
      return {
        mode: 'mono-repo',
        repos: monoDetection.packages.map((pkg) => ({
          path: pkg.relativePath,
          name: pkg.name,
          language: pkg.language,
          description: pkg.description,
        })),
        relationships: [],
        monoRepoOptions: {
          manager: monoDetection.manager || undefined,
          packageGlobs: monoDetection.packageGlobs,
        },
      };
    }

    // User declined auto-detected monorepo — fall through to manual monorepo setup
    const result = await promptMonoRepo(workspaceRoot);
    return {
      mode: 'mono-repo',
      repos: monoDetection.packages.map((pkg) => ({
        path: pkg.relativePath,
        name: pkg.name,
        language: pkg.language,
        description: pkg.description,
      })),
      relationships: [],
      monoRepoOptions: {
        manager: result.manager || undefined,
        packageGlobs: result.packageGlobs,
      },
    };
  }

  // Git repos detected or nothing found
  const gitRoots = findGitRoots(workspaceRoot, 3);
  const dirAbs = resolve(workspaceRoot);
  const subRepos = gitRoots.filter((root) => resolve(root) !== dirAbs);
  const repoRoots = subRepos.length > 0 ? subRepos : gitRoots;

  if (repoRoots.length >= 2) {
    console.log(`Detected ${repoRoots.length} repos:`);
    for (const r of repoRoots) {
      console.log(`  - ${basename(r)}/`);
    }

    const confirm = await ask('\nUse detected repos? [Y/n]: ');
    if (!confirm || confirm.toLowerCase() === 'y') {
      // Ask about relationships
      const rels = await askRelationships(repoRoots.map((r) => basename(r)));
      relationships.push(...rels);

      printRecommendedStructure(repoRoots.map((r) => basename(r)));

      return {
        mode: 'multi-repo',
        repos: buildRepoEntries(workspaceRoot, repoRoots),
        relationships,
      };
    }
  } else if (repoRoots.length === 0) {
    console.log('No repos detected. Let\'s set up your workspace.\n');
  }

  // Manual repo collection
  const result = await promptMultiRepo(workspaceRoot);
  const repoNames = result.repoPaths.map((r) => basename(r));

  // Ask about relationships
  const rels = await askRelationships(repoNames);
  relationships.push(...rels);

  printRecommendedStructure(repoNames);

  return {
    mode: 'multi-repo',
    repos: buildRepoEntries(workspaceRoot, result.repoPaths),
    relationships,
  };
}

async function askRelationships(repoNames: string[]): Promise<Relationship[]> {
  if (repoNames.length < 2) return [];

  const answer = await ask('\nDo any of these repos call each other\'s APIs? [Y/n]: ');
  if (answer && answer.toLowerCase() !== 'y') return [];

  const relationships: Relationship[] = [];
  console.log('Enter API relationships (empty line to finish):');
  console.log(`  Repos: ${repoNames.join(', ')}`);

  while (true) {
    const from = await ask('  Consumer repo (or empty to finish): ');
    if (!from) break;
    if (!repoNames.includes(from)) {
      console.log(`  Unknown repo "${from}", choose from: ${repoNames.join(', ')}`);
      continue;
    }
    const to = await ask('  Provider repo: ');
    if (!repoNames.includes(to)) {
      console.log(`  Unknown repo "${to}", choose from: ${repoNames.join(', ')}`);
      continue;
    }
    if (from === to) {
      console.log('  Consumer and provider must be different repos');
      continue;
    }
    relationships.push({ from, to, type: 'api-consumer' });
    console.log(`  Added: ${from} → ${to} (api-consumer)`);
  }

  return relationships;
}

function printRecommendedStructure(repoNames: string[]): void {
  console.log('\nRecommended workspace structure:\n');
  console.log('  workspace/');
  console.log('  ├── ctx.yaml            ← ctxify config (just created)');
  console.log('  ├── .ctxify/            ← generated context (auto-added to .gitignore)');
  for (let i = 0; i < repoNames.length; i++) {
    const prefix = i === repoNames.length - 1 ? '└──' : '├──';
    const padding = ' '.repeat(Math.max(0, 20 - repoNames[i].length));
    console.log(`  ${prefix} ${repoNames[i]}/${padding}← repo`);
  }
  console.log('\n  Tip: keep repos as siblings under one workspace root.');
  console.log('  Use `ctxify add-repo <path>` to add repos later.\n');
}

function buildRepoEntries(workspaceRoot: string, repoPaths: string[]) {
  return repoPaths.map((root) => {
    const name = basename(root);
    const relPath = relative(workspaceRoot, root) || '.';
    const entry: { path: string; name: string; language?: string; description?: string } = { path: relPath, name };
    const pkg = readJsonFile<{ description?: string }>(join(root, 'package.json'));
    if (pkg) {
      entry.language = 'typescript';
      entry.description = pkg.description;
    }
    return entry;
  });
}
