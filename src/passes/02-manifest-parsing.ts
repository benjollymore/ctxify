import { join } from 'node:path';
import type { AnalysisPass } from './types.js';
import { readJsonFile, readFileIfExists } from '../utils/fs.js';
import { FRAMEWORK_INDICATORS } from '../utils/regex-patterns.js';

interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

interface GoMod {
  module: string;
  require: string[];
}

export const manifestParsingPass: AnalysisPass = {
  name: 'manifest-parsing',
  description: 'Parse package.json, go.mod, pyproject.toml to detect language and framework',
  dependencies: ['repo-detection'],
  configKeys: [],

  async execute(ctx, logger) {
    for (const repo of ctx.repos) {
      // Try package.json
      const pkg = readJsonFile<PackageJson>(join(repo.path, 'package.json'));
      if (pkg) {
        repo.manifestType = 'package.json';
        repo.language = repo.language || 'typescript';
        repo.description = repo.description || pkg.description || '';
        repo.dependencies = pkg.dependencies || {};
        repo.devDependencies = pkg.devDependencies || {};
        repo.scripts = pkg.scripts || {};

        // Detect framework from dependencies
        const allDeps = { ...repo.dependencies, ...repo.devDependencies };
        repo.framework = detectFramework(allDeps);

        // Refine language detection
        if (allDeps['typescript'] || allDeps['ts-node'] || allDeps['tsup'] || allDeps['tsx']) {
          repo.language = 'typescript';
        } else if (!allDeps['typescript']) {
          repo.language = 'javascript';
        }

        logger.debug(`${repo.name}: ${repo.language}/${repo.framework} (package.json)`);
        continue;
      }

      // Try go.mod
      const goMod = readFileIfExists(join(repo.path, 'go.mod'));
      if (goMod) {
        repo.manifestType = 'go.mod';
        repo.language = 'go';
        repo.framework = detectGoFramework(goMod);
        logger.debug(`${repo.name}: go/${repo.framework} (go.mod)`);
        continue;
      }

      // Try pyproject.toml
      const pyproject = readFileIfExists(join(repo.path, 'pyproject.toml'));
      if (pyproject) {
        repo.manifestType = 'pyproject.toml';
        repo.language = 'python';
        repo.framework = detectPythonFramework(pyproject);
        logger.debug(`${repo.name}: python/${repo.framework} (pyproject.toml)`);
        continue;
      }

      // Try requirements.txt
      const requirements = readFileIfExists(join(repo.path, 'requirements.txt'));
      if (requirements) {
        repo.manifestType = 'requirements.txt';
        repo.language = 'python';
        repo.framework = detectPythonFramework(requirements);
        logger.debug(`${repo.name}: python/${repo.framework} (requirements.txt)`);
        continue;
      }

      logger.warn(`${repo.name}: no manifest found`);
    }
  },
};

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
