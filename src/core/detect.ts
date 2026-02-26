import { resolve } from 'node:path';
import type { OperatingMode } from './config.js';
import { detectMonoRepo } from '../utils/monorepo.js';
import { findGitRoots } from '../utils/git.js';

export interface ModeDetectionResult {
  mode: OperatingMode;
  manager?: string | null;
  packageGlobs?: string[];
}

export function autoDetectMode(dir: string): ModeDetectionResult {
  const monoDetection = detectMonoRepo(dir);
  if (monoDetection.detected) {
    return { mode: 'mono-repo', manager: monoDetection.manager, packageGlobs: monoDetection.packageGlobs };
  }
  const gitRoots = findGitRoots(dir, 3);
  const dirAbs = resolve(dir);
  const subRepos = gitRoots.filter((root) => resolve(root) !== dirAbs);
  if (subRepos.length >= 2) return { mode: 'multi-repo' };
  return { mode: 'single-repo' };
}
