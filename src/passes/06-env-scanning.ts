import { join, relative } from 'node:path';
import type { AnalysisPass } from './types.js';
import type { EnvVar } from '../core/context.js';
import { findFiles, readFileIfExists } from '../utils/fs.js';
import { ENV_PATTERNS } from '../utils/regex-patterns.js';

const CODE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go'];
const ENV_FILE_PATTERNS = ['.env', '.env.example', '.env.local', '.env.development', '.env.production', '.env.test'];

export const envScanningPass: AnalysisPass = {
  name: 'env-scanning',
  description: 'Scan .env files and code references for environment variable names (never values)',
  dependencies: ['repo-detection'],
  configKeys: [],

  async execute(ctx, logger) {
    const envMap = new Map<string, EnvVar>();

    for (const repo of ctx.repos) {
      // Scan .env files (names only, never values)
      for (const envFile of ENV_FILE_PATTERNS) {
        const content = readFileIfExists(join(repo.path, envFile));
        if (!content) continue;

        const regex = new RegExp(ENV_PATTERNS.dotEnv.source, ENV_PATTERNS.dotEnv.flags);
        let match: RegExpExecArray | null;
        match = regex.exec(content);
        while (match !== null) {
          const name = match[1];
          if (name && !name.startsWith('#')) {
            addEnvVar(envMap, name, repo.name, envFile, 'env-file');
          }
          match = regex.exec(content);
        }
      }

      // Scan docker-compose files
      for (const dcFile of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
        const content = readFileIfExists(join(repo.path, dcFile));
        if (!content) continue;

        const envRegex = /^\s+-?\s*(\w+)[:=]/gm;
        let match: RegExpExecArray | null;
        match = envRegex.exec(content);
        while (match !== null) {
          const name = match[1];
          if (name && name === name.toUpperCase()) {
            addEnvVar(envMap, name, repo.name, dcFile, 'docker-compose');
          }
          match = envRegex.exec(content);
        }
      }

      // Scan code files for env var references
      const codeFiles = findFiles(
        repo.path,
        (name) => CODE_EXTENSIONS.some((ext) => name.endsWith(ext)),
        { maxDepth: ctx.config.options.maxDepth, exclude: ctx.config.options.excludePatterns },
      );

      for (const file of codeFiles) {
        const content = readFileIfExists(file);
        if (!content) continue;

        const relFile = relative(repo.path, file);
        const envPatternList = [ENV_PATTERNS.nodeProcessEnv, ENV_PATTERNS.pythonOsEnviron, ENV_PATTERNS.denoEnv];

        for (const pattern of envPatternList) {
          const regex = new RegExp(pattern.source, pattern.flags);
          let match: RegExpExecArray | null;
          match = regex.exec(content);
          while (match !== null) {
            const name = match[1] || match[2];
            if (name) {
              addEnvVar(envMap, name, repo.name, relFile, 'code-reference');
            }
            match = regex.exec(content);
          }
        }
      }
    }

    ctx.envVars = Array.from(envMap.values());
    logger.info(`Found ${ctx.envVars.length} unique environment variables`);
  },
};

function addEnvVar(
  map: Map<string, EnvVar>,
  name: string,
  repo: string,
  file: string,
  type: EnvVar['sources'][number]['type'],
): void {
  if (!map.has(name)) {
    map.set(name, { name, repos: [], sources: [] });
  }
  const envVar = map.get(name)!;
  if (!envVar.repos.includes(repo)) {
    envVar.repos.push(repo);
  }
  envVar.sources.push({ repo, file, type });
}
