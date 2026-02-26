import type { Renderer } from './types.js';
import { dumpYaml } from '../utils/yaml.js';

export const shardEnvRenderer: Renderer = {
  outputPath: '.ctxify/env/all.yaml',

  render(ctx) {
    const data = {
      env_vars: ctx.envVars.map((e) => ({
        name: e.name,
        repos: e.repos,
        sources: e.sources.map((s) => ({
          repo: s.repo,
          file: s.file,
          type: s.type,
        })),
      })),
    };

    return dumpYaml(data);
  },
};
