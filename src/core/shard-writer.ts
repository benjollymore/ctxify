import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { WorkspaceContext } from './context.js';
import type { Renderer, MultiRenderer } from '../renderers/types.js';
import { indexYamlRenderer } from '../renderers/index-yaml.js';
import { shardReposRenderer } from '../renderers/shard-repos.js';
import { shardEndpointsRenderer } from '../renderers/shard-endpoints.js';
import { shardTypesRenderer } from '../renderers/shard-types.js';
import { shardEnvRenderer } from '../renderers/shard-env.js';
import { shardTopologyRenderer } from '../renderers/shard-topology.js';
import { shardSchemasRenderer } from '../renderers/shard-schemas.js';
import { shardQuestionsRenderer } from '../renderers/shard-questions.js';

const singleRenderers: Renderer[] = [
  indexYamlRenderer,
  shardTypesRenderer,
  shardEnvRenderer,
  shardTopologyRenderer,
  shardQuestionsRenderer,
];

const multiRenderers: MultiRenderer[] = [
  shardReposRenderer,
  shardEndpointsRenderer,
  shardSchemasRenderer,
];

function resolveOutputPath(shardPath: string, workspaceRoot: string, outputDir: string): string {
  if (shardPath.startsWith('.ctxify/')) {
    return join(workspaceRoot, outputDir, shardPath.slice(8));
  }
  return join(workspaceRoot, shardPath);
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

export function writeShards(ctx: WorkspaceContext, workspaceRoot: string, outputDir: string): string[] {
  const written: string[] = [];

  for (const renderer of singleRenderers) {
    const fullPath = resolveOutputPath(renderer.outputPath, workspaceRoot, outputDir);
    writeFile(fullPath, renderer.render(ctx));
    written.push(renderer.outputPath);
  }

  for (const renderer of multiRenderers) {
    const files = renderer.renderAll(ctx);
    for (const [shardPath, content] of files) {
      const fullPath = resolveOutputPath(shardPath, workspaceRoot, outputDir);
      writeFile(fullPath, content);
      written.push(shardPath);
    }
  }

  return written;
}
