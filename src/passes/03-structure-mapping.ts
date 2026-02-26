import { join, relative } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import type { AnalysisPass } from './types.js';
import { isDirectory, isFile, readJsonFile, readFileIfExists } from '../utils/fs.js';

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb'];

interface PackageJsonEntries {
  main?: string;
  module?: string;
  bin?: string | Record<string, string>;
  exports?: unknown;
}

export const structureMappingPass: AnalysisPass = {
  name: 'structure-mapping',
  description: 'Identify key directories, entry points, and file counts',
  dependencies: ['repo-detection'],
  configKeys: [],

  async execute(ctx, logger) {
    for (const repo of ctx.repos) {
      repo.keyDirs = discoverKeyDirs(repo.path, ctx.config.options.excludePatterns ?? []);

      repo.entryPoints = discoverEntryPoints(repo.path, repo.manifestType);

      repo.fileCount = countFiles(repo.path, ctx.config.options.excludePatterns ?? []);

      logger.debug(`${repo.name}: ${repo.keyDirs.length} key dirs, ${repo.entryPoints.length} entry points, ${repo.fileCount} files`);
    }
  },
};

function discoverEntryPoints(repoPath: string, manifestType: string): string[] {
  const entries: string[] = [];

  if (manifestType === 'package.json') {
    const pkg = readJsonFile<PackageJsonEntries>(join(repoPath, 'package.json'));
    if (!pkg) return [];

    if (typeof pkg.main === 'string') addEntry(entries, repoPath, pkg.main);
    if (typeof pkg.module === 'string') addEntry(entries, repoPath, pkg.module);

    if (typeof pkg.bin === 'string') {
      addEntry(entries, repoPath, pkg.bin);
    } else if (pkg.bin && typeof pkg.bin === 'object') {
      for (const p of Object.values(pkg.bin)) {
        addEntry(entries, repoPath, p);
      }
    }

    extractExportPaths(pkg.exports, entries, repoPath);
  } else if (manifestType === 'go.mod') {
    if (isFile(join(repoPath, 'main.go'))) entries.push('main.go');
    try {
      const cmdDir = join(repoPath, 'cmd');
      if (isDirectory(cmdDir)) {
        for (const entry of readdirSync(cmdDir)) {
          if (isFile(join(cmdDir, entry, 'main.go'))) {
            entries.push(`cmd/${entry}/main.go`);
          }
        }
      }
    } catch {
      // skip inaccessible
    }
  } else if (manifestType === 'pyproject.toml') {
    const content = readFileIfExists(join(repoPath, 'pyproject.toml'));
    if (content) {
      const scriptPatterns = [
        /\[project\.scripts\]\s*\n((?:[^\[].+\n)*)/,
        /\[tool\.poetry\.scripts\]\s*\n((?:[^\[].+\n)*)/,
      ];
      for (const pattern of scriptPatterns) {
        const match = content.match(pattern);
        if (match) {
          const lines = match[1].split('\n');
          for (const line of lines) {
            const lineMatch = line.match(/\w+\s*=\s*["']([^"':]+)/);
            if (lineMatch) {
              const modPath = lineMatch[1].replace(/\./g, '/') + '.py';
              addEntry(entries, repoPath, modPath);
            }
          }
        }
      }
    }
  }

  return entries;
}

function resolveSourcePath(repoPath: string, rawPath: string): string | null {
  const p = rawPath.replace(/^\.\//, '');

  // If path has a dist/build prefix, prefer source equivalents over dist files
  const withoutDist = p.replace(/^(dist|build)\//, '');
  if (withoutDist !== p) {
    for (const ext of ['.ts', '.tsx']) {
      const candidate = withoutDist.replace(/\.js$/, ext);
      if (isFile(join(repoPath, candidate))) return candidate;
    }
    if (isFile(join(repoPath, withoutDist))) return withoutDist;

    // Try with src/ prefix (common: src/foo.ts → dist/foo.js)
    for (const ext of ['.ts', '.tsx']) {
      const candidate = 'src/' + withoutDist.replace(/\.js$/, ext);
      if (isFile(join(repoPath, candidate))) return candidate;
    }
  }

  // Try as-is
  if (isFile(join(repoPath, p))) return p;

  // Try .ts/.tsx instead of .js without dist stripping
  for (const ext of ['.ts', '.tsx']) {
    const candidate = p.replace(/\.js$/, ext);
    if (candidate !== p && isFile(join(repoPath, candidate))) return candidate;
  }

  return null;
}

function addEntry(entries: string[], repoPath: string, rawPath: string): void {
  const resolved = resolveSourcePath(repoPath, rawPath);
  if (resolved && !entries.includes(resolved)) {
    entries.push(resolved);
  }
}

function extractExportPaths(exports: unknown, entries: string[], repoPath: string): void {
  if (!exports) return;

  if (typeof exports === 'string') {
    addEntry(entries, repoPath, exports);
    return;
  }

  if (typeof exports === 'object' && exports !== null) {
    for (const [key, value] of Object.entries(exports as Record<string, unknown>)) {
      if (key === 'types') continue;
      if (typeof value === 'string') {
        addEntry(entries, repoPath, value);
      } else if (typeof value === 'object' && value !== null) {
        extractExportPaths(value, entries, repoPath);
      }
    }
  }
}

function discoverKeyDirs(repoPath: string, excludes: string[]): string[] {
  const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'build', '__pycache__', 'vendor'];
  const allExcludes = [...new Set([...excludes, ...DEFAULT_EXCLUDES])];
  const keyDirs: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 3) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    let hasCodeFiles = false;
    for (const entry of entries) {
      if (allExcludes.includes(entry) || entry.startsWith('.')) continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isFile() && CODE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
          hasCodeFiles = true;
        } else if (stat.isDirectory()) {
          walk(fullPath, depth + 1);
        }
      } catch {
        // skip inaccessible
      }
    }

    if (hasCodeFiles && dir !== repoPath) {
      keyDirs.push(relative(repoPath, dir));
    }
  }

  walk(repoPath, 0);
  return keyDirs.sort();
}

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
