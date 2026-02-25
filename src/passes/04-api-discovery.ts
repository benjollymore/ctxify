import { join, relative } from 'node:path';
import type { AnalysisPass } from './types.js';
import type { ApiEndpoint } from '../core/context.js';
import { findFiles, readFileIfExists } from '../utils/fs.js';
import { ROUTE_PATTERNS } from '../utils/regex-patterns.js';

const ROUTE_FILE_PATTERNS = [
  /route/i, /controller/i, /handler/i, /endpoint/i, /api/i, /server\./i, /app\./i,
];

const CODE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go'];

export const apiDiscoveryPass: AnalysisPass = {
  name: 'api-discovery',
  description: 'Discover API routes via regex patterns and OpenAPI specs',
  dependencies: ['repo-detection', 'manifest-parsing'],
  configKeys: [],

  async execute(ctx, logger) {
    for (const repo of ctx.repos) {
      const codeFiles = findFiles(
        repo.path,
        (name) => CODE_EXTENSIONS.some((ext) => name.endsWith(ext)),
        { maxDepth: ctx.config.options.maxDepth, exclude: ctx.config.options.excludePatterns },
      );

      // Filter to likely route files for efficiency
      const routeFiles = codeFiles.filter((f) => {
        const rel = relative(repo.path, f);
        return ROUTE_FILE_PATTERNS.some((pat) => pat.test(rel));
      });

      // Also check entry points
      const entryFiles = repo.entryPoints.map((ep) => join(repo.path, ep));
      const filesToScan = [...new Set([...routeFiles, ...entryFiles])];

      for (const file of filesToScan) {
        const content = readFileIfExists(file);
        if (!content) continue;

        const endpoints = extractRoutes(content, repo.name, relative(repo.path, file), repo.framework);
        ctx.apiEndpoints.push(...endpoints);
      }

      // Check for Next.js App Router
      if (repo.framework === 'react' || repo.framework === '') {
        const appRouterEndpoints = detectNextjsAppRouter(repo.path, repo.name, ctx.config.options.excludePatterns ?? []);
        ctx.apiEndpoints.push(...appRouterEndpoints);
      }

      logger.debug(`${repo.name}: found ${ctx.apiEndpoints.filter((e) => e.repo === repo.name).length} endpoints`);
    }

    logger.info(`Total: ${ctx.apiEndpoints.length} API endpoints discovered`);
  },
};

function extractRoutes(content: string, repoName: string, file: string, framework: string): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  for (const routePattern of ROUTE_PATTERNS) {
    // Skip patterns that don't match the repo's framework (if known)
    if (framework && routePattern.framework !== framework && routePattern.framework !== 'express') {
      // Express pattern is generic enough to match many frameworks
      continue;
    }

    const regex = new RegExp(routePattern.pattern.source, routePattern.pattern.flags);
    let match: RegExpExecArray | null;

    match = regex.exec(content);
    while (match !== null) {
      const method = routePattern.methodGroup > 0 ? (match[routePattern.methodGroup] || 'GET').toUpperCase() : 'GET';
      const path = routePattern.pathGroup > 0 ? match[routePattern.pathGroup] || '' : '';

      if (path || routePattern.framework === 'nextjs') {
        endpoints.push({
          repo: repoName,
          method,
          path,
          file,
          line: content.substring(0, match.index).split('\n').length,
        });
      }
      match = regex.exec(content);
    }
  }

  return deduplicateEndpoints(endpoints);
}

function detectNextjsAppRouter(repoPath: string, repoName: string, excludes: string[]): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  const routeFiles = findFiles(
    repoPath,
    (name) => name === 'route.ts' || name === 'route.js',
    { maxDepth: 8, exclude: excludes },
  );

  for (const file of routeFiles) {
    const content = readFileIfExists(file);
    if (!content) continue;

    const rel = relative(repoPath, file);
    // Convert app/api/users/route.ts -> /api/users
    const routePath = '/' + rel
      .replace(/^app\//, '')
      .replace(/\/route\.(ts|js)$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1');

    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) =>
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(content),
    );

    for (const method of methods) {
      endpoints.push({
        repo: repoName,
        method,
        path: routePath,
        file: rel,
      });
    }
  }

  return endpoints;
}

function deduplicateEndpoints(endpoints: ApiEndpoint[]): ApiEndpoint[] {
  const seen = new Set<string>();
  return endpoints.filter((ep) => {
    const key = `${ep.method}:${ep.path}:${ep.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
