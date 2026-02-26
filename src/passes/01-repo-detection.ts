import { basename, resolve } from 'node:path';
import type { AnalysisPass } from './types.js';
import { findGitRoots } from '../utils/git.js';
import { detectMonoRepo } from '../utils/monorepo.js';
import type { RepoInfo } from '../core/context.js';

export const repoDetectionPass: AnalysisPass = {
  name: 'repo-detection',
  description: 'Find .git/ directories in workspace and populate repo stubs',
  dependencies: [],
  configKeys: [],

  async execute(ctx, logger) {
    // If repos are already specified in config, use those paths
    if (ctx.config.repos.length > 0) {
      for (const entry of ctx.config.repos) {
        const repoPath = resolve(ctx.workspaceRoot, entry.path);
        logger.debug(`Using configured repo: ${entry.name} at ${repoPath}`);

        ctx.repos.push(createRepoStub(entry.name, repoPath));
      }
      logger.info(`Found ${ctx.repos.length} configured repos`);
      return;
    }

    // Auto-detect based on mode
    const mode = ctx.config.mode || 'multi-repo';

    switch (mode) {
      case 'single-repo': {
        const name = basename(resolve(ctx.workspaceRoot));
        logger.debug(`Single-repo mode: using workspace root as repo: ${name}`);
        ctx.repos.push(createRepoStub(name, resolve(ctx.workspaceRoot)));
        break;
      }

      case 'mono-repo': {
        const detection = detectMonoRepo(ctx.workspaceRoot);
        if (detection.detected) {
          for (const pkg of detection.packages) {
            logger.debug(`Detected monorepo package: ${pkg.name} at ${pkg.path}`);
            ctx.repos.push(createRepoStub(pkg.name, pkg.path));
          }
        } else {
          // Fallback: treat as single repo
          const name = basename(resolve(ctx.workspaceRoot));
          logger.warn(`Mono-repo mode but no packages detected, falling back to single repo`);
          ctx.repos.push(createRepoStub(name, resolve(ctx.workspaceRoot)));
        }
        break;
      }

      case 'multi-repo':
      default: {
        // Existing behavior: find .git/ directories
        const gitRoots = findGitRoots(ctx.workspaceRoot, ctx.config.options.maxDepth ?? 3);
        const workspaceAbs = resolve(ctx.workspaceRoot);
        const subRepos = gitRoots.filter((root) => resolve(root) !== workspaceAbs);
        const repoRoots = subRepos.length > 0 ? subRepos : gitRoots;

        for (const root of repoRoots) {
          const name = basename(root);
          logger.debug(`Detected repo: ${name} at ${root}`);
          ctx.repos.push(createRepoStub(name, root));
        }
        break;
      }
    }

    logger.info(`Detected ${ctx.repos.length} repos (mode: ${mode})`);
  },
};

function createRepoStub(name: string, path: string): RepoInfo {
  return {
    name,
    path,
    language: '',
    framework: '',
    description: '',
    entryPoints: [],
    keyDirs: [],
    fileCount: 0,
    dependencies: {},
    devDependencies: {},
    scripts: {},
    manifestType: '',
  };
}
