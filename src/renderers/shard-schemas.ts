import type { MultiRenderer } from './types.js';
import { dumpYaml } from '../utils/yaml.js';

export const shardSchemasRenderer: MultiRenderer = {
  outputPathTemplate: '.ctx/schemas/{name}.yaml',

  renderAll(ctx) {
    const result = new Map<string, string>();

    const byRepo = new Map<string, typeof ctx.dbSchemas>();
    for (const schema of ctx.dbSchemas) {
      if (!byRepo.has(schema.repo)) byRepo.set(schema.repo, []);
      byRepo.get(schema.repo)!.push(schema);
    }

    for (const [repoName, schemas] of byRepo) {
      const data = {
        repo: repoName,
        schemas: schemas.map((db) => ({
          orm: db.orm,
          file: db.file,
          models: db.models.map((m) => ({
            name: m.name,
            fields: m.fields,
            relations: m.relations ?? null,
          })),
        })),
      };

      result.set(`.ctx/schemas/${repoName}.yaml`, dumpYaml(data));
    }

    return result;
  },
};
