import { join, relative } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import type { AnalysisPass } from './types.js';
import { isDirectory, isFile } from '../utils/fs.js';

const KEY_DIRS = ['src', 'lib', 'app', 'pages', 'routes', 'api', 'components', 'hooks', 'utils', 'services', 'models', 'schemas', 'prisma', 'db', 'migrations', 'config', 'scripts', 'cmd', 'pkg', 'internal'];

const ENTRY_POINTS = [
  'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
  'src/app.ts', 'src/app.js', 'src/server.ts', 'src/server.js',
  'index.ts', 'index.js', 'main.ts', 'main.js',
  'app.ts', 'app.js', 'server.ts', 'server.js',
  'app/layout.tsx', 'app/page.tsx', 'pages/_app.tsx', 'pages/index.tsx',
  'main.go', 'cmd/main.go', 'main.py', 'app.py', 'manage.py',
];

export const structureMappingPass: AnalysisPass = {
  name: 'structure-mapping',
  description: 'Identify key directories, entry points, and file counts',
  dependencies: ['repo-detection'],
  configKeys: [],

  async execute(ctx, logger) {
    for (const repo of ctx.repos) {
      // Find key directories
      repo.keyDirs = KEY_DIRS.filter((dir) => isDirectory(join(repo.path, dir)));

      // Find entry points
      repo.entryPoints = ENTRY_POINTS.filter((ep) => isFile(join(repo.path, ep)));

      // Count files (excluding common excludes)
      repo.fileCount = countFiles(repo.path, ctx.config.options.excludePatterns ?? []);

      logger.debug(`${repo.name}: ${repo.keyDirs.length} key dirs, ${repo.entryPoints.length} entry points, ${repo.fileCount} files`);
    }
  },
};

function countFiles(dir: string, excludes: string[], maxDepth = 8): number {
  let count = 0;

  function walk(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (excludes.includes(entry)) continue;
      const fullPath = join(currentDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (stat.isFile()) {
          count++;
        }
      } catch {
        // skip inaccessible
      }
    }
  }

  walk(dir, 0);
  return count;
}
