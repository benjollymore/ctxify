import type { MultiRenderer } from './types.js';
import { dumpYaml } from '../utils/yaml.js';
import { relative } from 'node:path';

export const shardReposRenderer: MultiRenderer = {
  outputPathTemplate: '.ctx/repos/{name}.yaml',

  renderAll(ctx) {
    const result = new Map<string, string>();

    for (const repo of ctx.repos) {
      const conventions = ctx.conventions
        .filter((c) => c.repo === repo.name)
        .map((c) => ({
          category: c.category,
          pattern: c.pattern,
          description: c.description,
        }));

      const data: Record<string, unknown> = {
        name: repo.name,
        path: './' + relative(ctx.workspaceRoot, repo.path),
        language: repo.language || null,
        framework: repo.framework || null,
        description: repo.description || null,
        manifest_type: repo.manifestType || null,
        file_count: repo.fileCount,
        entry_points: repo.entryPoints,
        key_dirs: repo.keyDirs,
        scripts: repo.scripts,
        dependencies: repo.dependencies,
        dev_dependencies: repo.devDependencies,
      };

      if (conventions.length > 0) {
        data.conventions = conventions;
      }

      result.set(`.ctx/repos/${repo.name}.yaml`, dumpYaml(data));
    }

    return result;
  },
};
