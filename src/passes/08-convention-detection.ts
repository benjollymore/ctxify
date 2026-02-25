import { join } from 'node:path';
import type { AnalysisPass } from './types.js';
import type { Convention } from '../core/context.js';
import { isFile, findFiles, readFileIfExists } from '../utils/fs.js';

const TOOLING_FILES: Record<string, string> = {
  '.eslintrc.json': 'ESLint',
  '.eslintrc.js': 'ESLint',
  '.eslintrc.cjs': 'ESLint',
  'eslint.config.js': 'ESLint (flat config)',
  'eslint.config.mjs': 'ESLint (flat config)',
  '.prettierrc': 'Prettier',
  '.prettierrc.json': 'Prettier',
  'prettier.config.js': 'Prettier',
  'biome.json': 'Biome',
  'biome.jsonc': 'Biome',
  '.editorconfig': 'EditorConfig',
  'tsconfig.json': 'TypeScript',
  'jest.config.js': 'Jest',
  'jest.config.ts': 'Jest',
  'vitest.config.ts': 'Vitest',
  'vitest.config.js': 'Vitest',
  'playwright.config.ts': 'Playwright',
  'cypress.config.ts': 'Cypress',
  '.github/workflows': 'GitHub Actions',
  'Dockerfile': 'Docker',
  'docker-compose.yml': 'Docker Compose',
  'docker-compose.yaml': 'Docker Compose',
  'Makefile': 'Make',
  'Taskfile.yml': 'Task',
  'turbo.json': 'Turborepo',
  'nx.json': 'Nx',
  'pnpm-workspace.yaml': 'pnpm workspaces',
  'lerna.json': 'Lerna',
};

export const conventionDetectionPass: AnalysisPass = {
  name: 'convention-detection',
  description: 'Detect file naming patterns, architecture styles, and tooling configs',
  dependencies: ['repo-detection', 'structure-mapping'],
  configKeys: [],

  async execute(ctx, logger) {
    for (const repo of ctx.repos) {
      // Detect tooling
      for (const [file, tool] of Object.entries(TOOLING_FILES)) {
        if (isFile(join(repo.path, file))) {
          ctx.conventions.push({
            repo: repo.name,
            category: 'tooling',
            pattern: file,
            description: `Uses ${tool}`,
          });
        }
      }

      // Detect file naming conventions
      detectNamingConventions(repo.path, repo.name, ctx.conventions, ctx.config.options.excludePatterns ?? []);

      // Detect architecture patterns
      detectArchitecturePatterns(repo.keyDirs, repo.name, ctx.conventions);

      // Detect testing conventions
      detectTestingConventions(repo.path, repo.name, ctx.conventions, ctx.config.options.excludePatterns ?? []);

      logger.debug(`${repo.name}: found ${ctx.conventions.filter((c) => c.repo === repo.name).length} conventions`);
    }

    logger.info(`Total: ${ctx.conventions.length} conventions detected`);
  },
};

function detectNamingConventions(
  repoPath: string,
  repoName: string,
  conventions: Convention[],
  excludes: string[],
): void {
  const codeFiles = findFiles(
    repoPath,
    (name) => ['.ts', '.tsx', '.js', '.jsx'].some((ext) => name.endsWith(ext)),
    { maxDepth: 3, exclude: excludes },
  );

  const names = codeFiles.map((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1].replace(/\.[^.]+$/, '');
  });

  // Check kebab-case vs camelCase vs PascalCase
  const kebab = names.filter((n) => /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(n)).length;
  const camel = names.filter((n) => /^[a-z][a-zA-Z0-9]*$/.test(n) && /[A-Z]/.test(n)).length;
  const pascal = names.filter((n) => /^[A-Z][a-zA-Z0-9]*$/.test(n)).length;

  const total = names.length || 1;
  if (kebab / total > 0.3) {
    conventions.push({
      repo: repoName,
      category: 'naming',
      pattern: 'kebab-case',
      description: `File names use kebab-case (${Math.round((kebab / total) * 100)}% of files)`,
    });
  }
  if (camel / total > 0.3) {
    conventions.push({
      repo: repoName,
      category: 'naming',
      pattern: 'camelCase',
      description: `File names use camelCase (${Math.round((camel / total) * 100)}% of files)`,
    });
  }
  if (pascal / total > 0.3) {
    conventions.push({
      repo: repoName,
      category: 'naming',
      pattern: 'PascalCase',
      description: `File names use PascalCase (${Math.round((pascal / total) * 100)}% of files)`,
    });
  }
}

function detectArchitecturePatterns(keyDirs: string[], repoName: string, conventions: Convention[]): void {
  const dirs = new Set(keyDirs);

  if (dirs.has('components') && dirs.has('hooks') && (dirs.has('pages') || dirs.has('app'))) {
    conventions.push({
      repo: repoName,
      category: 'structure',
      pattern: 'component-based',
      description: 'React/component-based architecture with hooks',
    });
  }

  if (dirs.has('routes') && dirs.has('services') && dirs.has('models')) {
    conventions.push({
      repo: repoName,
      category: 'structure',
      pattern: 'MVC',
      description: 'MVC-style architecture (routes/services/models)',
    });
  }

  if (dirs.has('cmd') && dirs.has('pkg') && dirs.has('internal')) {
    conventions.push({
      repo: repoName,
      category: 'structure',
      pattern: 'go-standard',
      description: 'Go standard project layout (cmd/pkg/internal)',
    });
  }

  if (dirs.has('src') && dirs.has('lib')) {
    conventions.push({
      repo: repoName,
      category: 'structure',
      pattern: 'src-lib',
      description: 'Source/library separation (src/lib)',
    });
  }
}

function detectTestingConventions(
  repoPath: string,
  repoName: string,
  conventions: Convention[],
  excludes: string[],
): void {
  const testFiles = findFiles(
    repoPath,
    (name) => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(name) || name.endsWith('_test.go') || name.startsWith('test_'),
    { maxDepth: 5, exclude: excludes },
  );

  if (testFiles.length === 0) return;

  // Check colocation (tests next to source) vs separate test directory
  const colocated = testFiles.filter((f) => !f.includes('/__tests__/') && !f.includes('/test/')).length;
  const separated = testFiles.length - colocated;

  if (colocated > separated) {
    conventions.push({
      repo: repoName,
      category: 'testing',
      pattern: 'colocated',
      description: `Tests colocated with source files (${testFiles.length} test files)`,
    });
  } else {
    conventions.push({
      repo: repoName,
      category: 'testing',
      pattern: 'separated',
      description: `Tests in separate directories (${testFiles.length} test files)`,
    });
  }
}
