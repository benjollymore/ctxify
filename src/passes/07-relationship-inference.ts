import { join } from 'node:path';
import type { AnalysisPass } from './types.js';
import type { InferredRelationship, Question } from '../core/context.js';
import { readJsonFile, readFileIfExists, findFiles } from '../utils/fs.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

export const relationshipInferencePass: AnalysisPass = {
  name: 'relationship-inference',
  description: 'Infer cross-repo relationships from dependencies, HTTP clients, shared packages',
  dependencies: ['repo-detection', 'manifest-parsing', 'api-discovery', 'env-scanning'],
  configKeys: [],

  async execute(ctx, logger) {
    // In single-repo mode, skip all cross-repo inference (only 1 repo)
    if (ctx.config.mode === 'single-repo') {
      // Just merge manual declarations
      for (const rel of ctx.config.relationships) {
        ctx.relationships.push({
          from: rel.from,
          to: rel.to,
          type: rel.type,
          evidence: `Declared in ctx.yaml: ${rel.description || ''}`,
          confidence: 1.0,
        });
      }
      logger.info(`Single-repo mode: skipped cross-repo inference, ${ctx.relationships.length} manual relationships`);
      return;
    }

    inferWorkspaceDeps(ctx.repos, ctx.relationships, ctx.workspaceRoot);
    inferPackageDeps(ctx.repos, ctx.relationships);
    inferApiConsumers(ctx.repos, ctx.apiEndpoints, ctx.relationships, ctx.questions, ctx.config.options);
    inferSharedEnvVars(ctx.envVars, ctx.relationships);

    // Merge manually declared relationships from config
    for (const rel of ctx.config.relationships) {
      const alreadyExists = ctx.relationships.some(
        (r) => r.from === rel.from && r.to === rel.to && r.type === rel.type,
      );
      if (!alreadyExists) {
        ctx.relationships.push({
          from: rel.from,
          to: rel.to,
          type: rel.type,
          evidence: `Declared in ctx.yaml: ${rel.description || ''}`,
          confidence: 1.0,
        });
      }
    }

    logger.info(`Inferred ${ctx.relationships.length} relationships`);
  },
};

function inferWorkspaceDeps(
  repos: import('../core/context.js').RepoInfo[],
  relationships: InferredRelationship[],
  workspaceRoot: string,
): void {
  const rootPkg = readJsonFile<PackageJson>(join(workspaceRoot, 'package.json'));
  if (!rootPkg?.workspaces) return;

  const repoNames = new Map(repos.map((r) => [r.name, r]));

  for (const repo of repos) {
    for (const dep of Object.keys({ ...repo.dependencies, ...repo.devDependencies })) {
      for (const [otherName] of repoNames) {
        if (otherName !== repo.name && (dep === otherName || dep.endsWith(`/${otherName}`))) {
          relationships.push({
            from: repo.name,
            to: otherName,
            type: 'workspace',
            evidence: `Workspace dependency: ${dep} in ${repo.name}/package.json`,
            confidence: 0.95,
          });
        }
      }
    }
  }
}

function inferPackageDeps(
  repos: import('../core/context.js').RepoInfo[],
  relationships: InferredRelationship[],
): void {
  const repoNames = new Map(repos.map((r) => [r.name, r]));

  for (const repo of repos) {
    const allDeps = Object.keys({ ...repo.dependencies, ...repo.devDependencies });
    for (const dep of allDeps) {
      for (const [otherName] of repoNames) {
        if (otherName !== repo.name && dep.includes(otherName)) {
          const alreadyExists = relationships.some((r) => r.from === repo.name && r.to === otherName);
          if (!alreadyExists) {
            relationships.push({
              from: repo.name,
              to: otherName,
              type: 'dependency',
              evidence: `Package dependency: ${dep}`,
              confidence: 0.7,
            });
          }
        }
      }
    }
  }
}

function inferApiConsumers(
  repos: import('../core/context.js').RepoInfo[],
  apiEndpoints: import('../core/context.js').ApiEndpoint[],
  relationships: InferredRelationship[],
  questions: Question[],
  options: import('../core/config.js').ContextOptions,
): void {
  if (apiEndpoints.length === 0) return;

  const httpPatterns = [
    /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /axios\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/g,
  ];

  for (const repo of repos) {
    const codeFiles = findFiles(
      repo.path,
      (name) => ['.ts', '.js', '.tsx', '.jsx'].some((ext) => name.endsWith(ext)),
      { maxDepth: options.maxDepth, exclude: options.excludePatterns },
    );

    for (const file of codeFiles) {
      const content = readFileIfExists(file);
      if (!content) continue;

      for (const pattern of httpPatterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;
        match = regex.exec(content);
        while (match !== null) {
          const url = match[1];
          if (url) {
            for (const endpoint of apiEndpoints) {
              if (endpoint.repo === repo.name) { match = regex.exec(content); continue; }
              if (url.includes(endpoint.path) || urlMatchesRoute(url, endpoint.path)) {
                const alreadyExists = relationships.some(
                  (r) => r.from === repo.name && r.to === endpoint.repo && r.type === 'api-consumer',
                );
                if (!alreadyExists) {
                  relationships.push({
                    from: repo.name,
                    to: endpoint.repo,
                    type: 'api-consumer',
                    evidence: `HTTP call to ${endpoint.method} ${endpoint.path} (found in code)`,
                    confidence: 0.8,
                  });
                }
              }
            }
          }
          match = regex.exec(content);
        }
      }
    }
  }

  // Emit questions for API endpoints with no detected consumers
  for (const endpoint of apiEndpoints) {
    const hasConsumer = relationships.some(
      (r) => r.to === endpoint.repo && r.type === 'api-consumer',
    );
    if (!hasConsumer) {
      questions.push({
        id: `api-${endpoint.repo}-${endpoint.method}-${endpoint.path}`.replace(/[^a-z0-9-]/gi, '-'),
        pass: 'relationship-inference',
        category: 'api',
        question: `API consumer unknown for ${endpoint.method} ${endpoint.path}`,
        context: `${endpoint.repo} serves ${endpoint.method} ${endpoint.path} (${endpoint.file}) but no consumer was detected in the workspace.`,
        confidence: 0.3,
      });
    }
  }
}

function urlMatchesRoute(url: string, route: string): boolean {
  try {
    const urlPath = new URL(url, 'http://localhost').pathname;
    return urlPath === route || urlPath.endsWith(route);
  } catch {
    return url.includes(route);
  }
}

function inferSharedEnvVars(
  envVars: import('../core/context.js').EnvVar[],
  relationships: InferredRelationship[],
): void {
  for (const envVar of envVars) {
    if (envVar.repos.length > 1) {
      for (let i = 0; i < envVar.repos.length; i++) {
        for (let j = i + 1; j < envVar.repos.length; j++) {
          const alreadyExists = relationships.some(
            (r) =>
              (r.from === envVar.repos[i] && r.to === envVar.repos[j]) ||
              (r.from === envVar.repos[j] && r.to === envVar.repos[i]),
          );
          if (!alreadyExists) {
            relationships.push({
              from: envVar.repos[i],
              to: envVar.repos[j],
              type: 'shared-db',
              evidence: `Shared environment variable: ${envVar.name}`,
              confidence: 0.5,
            });
          }
        }
      }
    }
  }
}
