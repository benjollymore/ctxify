import type { Renderer } from './types.js';
import { dumpYaml } from '../utils/yaml.js';

export const shardTypesRenderer: Renderer = {
  outputPath: '.ctx/types/shared.yaml',

  render(ctx) {
    const data = {
      shared_types: ctx.sharedTypes.map((t) => ({
        name: t.name,
        kind: t.kind,
        defined_in: t.definedIn,
        file: t.file,
        used_by: t.usedBy,
        properties: t.properties ?? null,
      })),
    };

    return dumpYaml(data);
  },
};
