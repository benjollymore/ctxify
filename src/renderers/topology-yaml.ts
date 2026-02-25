import type { Renderer } from './types.js';
import { dumpYaml } from '../utils/yaml.js';

export const topologyYamlRenderer: Renderer = {
  outputPath: '.ctx/topology.yaml',

  render(ctx) {
    const topology = {
      generated_by: 'ctxify',
      last_scanned: ctx.metadata.generatedAt,
      repos: ctx.repos.map((r) => ({
        name: r.name,
        path: r.path,
        language: r.language,
        framework: r.framework,
      })),
      edges: ctx.relationships.map((r) => ({
        from: r.from,
        to: r.to,
        type: r.type,
        confidence: r.confidence,
        evidence: r.evidence,
      })),
    };

    return dumpYaml(topology);
  },
};
