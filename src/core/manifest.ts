import { join, relative } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { readJsonFile, readFileIfExists, isFile, isDirectory } from '../utils/fs.js';

// ── Constants ─────────────────────────────────────────────────────────

const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'build', '__pycache__', 'vendor'];

// ── Types ──────────────────────────────────────────────────────────────

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

interface PackageJson {
  name?: string;
  description?: string;
  main?: string;
  module?: string;
  bin?: string | Record<string, string>;
  exports?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// ── Framework indicators (copied from utils/regex-patterns.ts) ─────────

const FRAMEWORK_INDICATORS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'next', '@tanstack/react-query'],
  vue: ['vue', 'nuxt', '@vue/'],
  angular: ['@angular/core'],
  svelte: ['svelte', '@sveltejs/'],
  express: ['express'],
  hono: ['hono'],
  fastify: ['fastify'],
  nestjs: ['@nestjs/core'],
  django: ['django'],
  flask: ['flask'],
  fastapi: ['fastapi'],
  gin: ['github.com/gin-gonic/gin'],
  prisma: ['prisma', '@prisma/client'],
  drizzle: ['drizzle-orm'],
  commander: ['commander', 'yargs', 'oclif', 'clipanion', '@oclif/core'],
};

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb'];

// ── Empty defaults ─────────────────────────────────────────────────────

function emptyManifest(): ManifestData {
  return {
    language: '',
    framework: '',
    description: '',
    dependencies: {},
    devDependencies: {},
    scripts: {},
    manifestType: '',
    entryPoints: [],
    keyDirs: [],
    fileCount: 0,
  };
}

// ── Public API ─────────────────────────────────────────────────────────

export function parseRepoManifest(repoPath: string, excludePatterns?: string[]): ManifestData {
  const excludes = excludePatterns ?? [];
  const data = emptyManifest();

  // Try package.json first
  const pkg = readJsonFile<PackageJson>(join(repoPath, 'package.json'));
  if (pkg) {
    data.manifestType = 'package.json';
    data.description = pkg.description || '';
    data.dependencies = pkg.dependencies || {};
    data.devDependencies = pkg.devDependencies || {};
    data.scripts = pkg.scripts || {};

    const allDeps = { ...data.dependencies, ...data.devDependencies };
    data.framework = detectFramework(allDeps);

    if (allDeps['typescript'] || allDeps['ts-node'] || allDeps['tsup'] || allDeps['tsx']) {
      data.language = 'typescript';
    } else {
      data.language = 'javascript';
    }

    data.entryPoints = discoverEntryPoints(repoPath, data.manifestType);
    data.keyDirs = discoverKeyDirs(repoPath, excludes);
    data.fileCount = countFiles(repoPath, excludes);
    return data;
  }

  // Try go.mod
  const goMod = readFileIfExists(join(repoPath, 'go.mod'));
  if (goMod) {
    data.manifestType = 'go.mod';
    data.language = 'go';
    data.framework = detectGoFramework(goMod);

    data.entryPoints = discoverEntryPoints(repoPath, data.manifestType);
    data.keyDirs = discoverKeyDirs(repoPath, excludes);
    data.fileCount = countFiles(repoPath, excludes);
    return data;
  }

  // Try pyproject.toml
  const pyproject = readFileIfExists(join(repoPath, 'pyproject.toml'));
  if (pyproject) {
    data.manifestType = 'pyproject.toml';
    data.language = 'python';
    data.framework = detectPythonFramework(pyproject);

    data.entryPoints = discoverEntryPoints(repoPath, data.manifestType);
    data.keyDirs = discoverKeyDirs(repoPath, excludes);
    data.fileCount = countFiles(repoPath, excludes);
    return data;
  }

  // Try requirements.txt
  const requirements = readFileIfExists(join(repoPath, 'requirements.txt'));
  if (requirements) {
    data.manifestType = 'requirements.txt';
    data.language = 'python';
    data.framework = detectPythonFramework(requirements);

    data.entryPoints = discoverEntryPoints(repoPath, data.manifestType);
    data.keyDirs = discoverKeyDirs(repoPath, excludes);
    data.fileCount = countFiles(repoPath, excludes);
    return data;
  }

  // No manifest found — return empty defaults
  return data;
}

// ── Framework detection ────────────────────────────────────────────────

function detectFramework(deps: Record<string, string>): string {
  const depNames = Object.keys(deps);
  for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
    if (indicators.some((ind) => depNames.some((d) => d === ind || d.startsWith(ind)))) {
      return framework;
    }
  }
  return '';
}

function detectGoFramework(goMod: string): string {
  if (goMod.includes('github.com/gin-gonic/gin')) return 'gin';
  if (goMod.includes('github.com/labstack/echo')) return 'echo';
  if (goMod.includes('github.com/gorilla/mux')) return 'gorilla';
  if (goMod.includes('github.com/gofiber/fiber')) return 'fiber';
  return '';
}

function detectPythonFramework(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes('fastapi')) return 'fastapi';
  if (lower.includes('django')) return 'django';
  if (lower.includes('flask')) return 'flask';
  if (lower.includes('starlette')) return 'starlette';
  return '';
}

// ── Entry point discovery ──────────────────────────────────────────────

function discoverEntryPoints(repoPath: string, manifestType: string): string[] {
  const entries: string[] = [];

  if (manifestType === 'package.json') {
    const pkg = readJsonFile<PackageJson>(join(repoPath, 'package.json'));
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
        /\[project\.scripts\]\s*\n((?:[^[].+\n)*)/,
        /\[tool\.poetry\.scripts\]\s*\n((?:[^[].+\n)*)/,
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

    // Try with src/ prefix (common: src/foo.ts -> dist/foo.js)
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

// ── Key directory discovery ────────────────────────────────────────────

function discoverKeyDirs(repoPath: string, excludes: string[]): string[] {
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

// ── File counting ──────────────────────────────────────────────────────

function countFiles(dir: string, excludes: string[], maxDepth = 8): number {
  const allExcludes = [...new Set([...excludes, ...DEFAULT_EXCLUDES])];
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
      if (allExcludes.includes(entry)) continue;
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
