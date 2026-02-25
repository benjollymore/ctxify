import type { MultiRenderer } from './types.js';
import { dumpYaml } from '../utils/yaml.js';

export const shardEndpointsRenderer: MultiRenderer = {
  outputPathTemplate: '.ctx/endpoints/{name}.yaml',

  renderAll(ctx) {
    const result = new Map<string, string>();

    const byRepo = new Map<string, typeof ctx.apiEndpoints>();
    for (const ep of ctx.apiEndpoints) {
      if (!byRepo.has(ep.repo)) byRepo.set(ep.repo, []);
      byRepo.get(ep.repo)!.push(ep);
    }

    for (const [repoName, endpoints] of byRepo) {
      const data = {
        repo: repoName,
        endpoints: endpoints.map((ep) => ({
          method: ep.method,
          path: ep.path,
          file: ep.file,
          line: ep.line ?? null,
          handler: ep.handler ?? null,
          request_type: ep.requestType ?? null,
          response_type: ep.responseType ?? null,
        })),
      };

      result.set(`.ctx/endpoints/${repoName}.yaml`, dumpYaml(data));
    }

    return result;
  },
};
