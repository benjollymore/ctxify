import { basename, resolve } from 'node:path';
import type { AnalysisPass } from './types.js';
import { findGitRoots } from '../utils/git.js';
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

    // Auto-detect repos by finding .git/ directories
    const gitRoots = findGitRoots(ctx.workspaceRoot, ctx.config.options.maxDepth ?? 3);

    // Filter out the workspace root itself if it's a git repo (we want sub-repos)
    const workspaceAbs = resolve(ctx.workspaceRoot);
    const subRepos = gitRoots.filter((root) => resolve(root) !== workspaceAbs);

    // If no sub-repos found but workspace itself is a git repo, treat it as a single repo
    const repoRoots = subRepos.length > 0 ? subRepos : gitRoots;

    for (const root of repoRoots) {
      const name = basename(root);
      logger.debug(`Detected repo: ${name} at ${root}`);
      ctx.repos.push(createRepoStub(name, root));
    }

    logger.info(`Detected ${ctx.repos.length} repos`);
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
