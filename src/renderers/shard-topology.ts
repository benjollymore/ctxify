import type { Renderer } from './types.js';
import { dumpYaml } from '../utils/yaml.js';

export const shardTopologyRenderer: Renderer = {
  outputPath: '.ctx/topology/graph.yaml',

  render(ctx) {
    const data = {
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

    return dumpYaml(data);
  },
};
