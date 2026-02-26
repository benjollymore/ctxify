import type { Renderer } from './types.js';
import { dumpYaml } from '../utils/yaml.js';
import { relative } from 'node:path';

export const indexYamlRenderer: Renderer = {
  outputPath: '.ctxify/index.yaml',

  render(ctx) {
    const repos = ctx.repos.map((r) => {
      const endpointCount = ctx.apiEndpoints.filter((e) => e.repo === r.name).length;
      const typesDefined = ctx.sharedTypes.filter((t) => t.definedIn === r.name).length;
      const typesConsumed = ctx.sharedTypes.filter(
        (t) => t.definedIn !== r.name && t.usedBy.includes(r.name),
      ).length;

      const entry: Record<string, unknown> = {
        name: r.name,
        language: r.language || null,
        framework: r.framework || null,
        path: './' + relative(ctx.workspaceRoot, r.path),
      };
      if (endpointCount > 0) entry.endpoints = endpointCount;
      if (typesDefined > 0) entry.types_defined = typesDefined;
      if (typesConsumed > 0) entry.types_consumed = typesConsumed;

      return entry;
    });

    const relationships = ctx.relationships.map((r) => ({
      from: r.from,
      to: r.to,
      type: r.type,
    }));

    const data: Record<string, unknown> = {
      ctxify: '2.0',
      mode: ctx.config.mode || 'multi-repo',
      scanned_at: ctx.metadata.generatedAt,
      workspace: ctx.workspaceRoot,
      repos,
    };

    if (relationships.length > 0) {
      data.relationships = relationships;
    }

    data.totals = {
      repos: ctx.repos.length,
      endpoints: ctx.apiEndpoints.length,
      shared_types: ctx.sharedTypes.length,
      env_vars: ctx.envVars.length,
    };

    data.shards = {
      repos: '.ctxify/repos/{name}.yaml',
      endpoints: '.ctxify/endpoints/{name}.yaml',
      types: '.ctxify/types/shared.yaml',
      env: '.ctxify/env/all.yaml',
      topology: '.ctxify/topology/graph.yaml',
      schemas: '.ctxify/schemas/{name}.yaml',
      questions: '.ctxify/questions/pending.yaml',
    };

    return dumpYaml(data);
  },
};
