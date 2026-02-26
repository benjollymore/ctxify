import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { OperatingMode } from '../core/config.js';
import { detectMonoRepo } from '../utils/monorepo.js';
import { findGitRoots } from '../utils/git.js';

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function promptMode(): Promise<OperatingMode> {
  console.log('\nWhat kind of workspace is this?');
  console.log('  [1] single-repo  — one repository');
  console.log('  [2] multi-repo   — multiple independent repositories');
  console.log('  [3] mono-repo    — monorepo with workspace packages');
  console.log('');

  const answer = await ask('Select mode [1/2/3]: ');

  switch (answer) {
    case '1': return 'single-repo';
    case '2': return 'multi-repo';
    case '3': return 'mono-repo';
    default:
      console.log(`Invalid selection "${answer}", defaulting to multi-repo`);
      return 'multi-repo';
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
