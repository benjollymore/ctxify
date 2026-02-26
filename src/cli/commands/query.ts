import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parseYaml } from '../../utils/yaml.js';

type Section = 'endpoints' | 'types' | 'env' | 'topology' | 'schemas' | 'questions';

const VALID_SECTIONS: Section[] = ['endpoints', 'types', 'env', 'topology', 'schemas', 'questions'];

function readShard(path: string): unknown {
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf-8');
  return parseYaml<unknown>(content);
}

function errorJson(message: string): never {
  console.log(JSON.stringify({ error: message }, null, 2));
  process.exit(1);
}

function filterEndpoints(
  data: { endpoints?: Array<Record<string, unknown>> },
  method?: string,
  pathContains?: string,
): unknown {
  let endpoints = data.endpoints || [];
  if (method) {
    endpoints = endpoints.filter(
      (ep) => typeof ep.method === 'string' && ep.method.toUpperCase() === method.toUpperCase(),
    );
  }
  if (pathContains) {
    endpoints = endpoints.filter(
      (ep) => typeof ep.path === 'string' && ep.path.includes(pathContains),
    );
  }
  return { ...data, endpoints };
}

function filterTypes(
  data: { shared_types?: Array<Record<string, unknown>> },
  name?: string,
): unknown {
  if (!name) return data;
  const types = (data.shared_types || []).filter(
    (t) => typeof t.name === 'string' && t.name === name,
  );
  return { ...data, shared_types: types };
}

function listShardFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.yaml'));
}

export function registerQueryCommand(program: Command): void {
  program
    .command('query')
    .description('Query specific shards with filters, output JSON')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .option('--repo <name>', 'Filter by repo name')
    .option('--section <section>', 'Section to query: endpoints, types, env, topology, schemas, questions')
    .option('--method <method>', 'Filter endpoints by HTTP method')
    .option('--path-contains <substr>', 'Filter endpoints by path substring')
    .option('--name <name>', 'Filter types by name')
    .action(async (options: {
      dir?: string;
      repo?: string;
      section?: string;
      method?: string;
      pathContains?: string;
      name?: string;
    }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const outputDir = '.ctxify';
      const ctxDir = join(workspaceRoot, outputDir);

      // Check if shards exist
      const indexPath = join(ctxDir, 'index.yaml');
      if (!existsSync(indexPath)) {
        errorJson('No .ctxify/index.yaml found. Run "ctxify scan" first.');
      }

      const section = options.section as Section | undefined;
      if (section && !VALID_SECTIONS.includes(section)) {
        errorJson(`Invalid section "${section}". Valid: ${VALID_SECTIONS.join(', ')}`);
      }

      // If no section and no repo, return the index
      if (!section && !options.repo) {
        const data = readShard(indexPath);
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      // If repo specified but no section, return full repo shard
      if (options.repo && !section) {
        const repoPath = join(ctxDir, 'repos', `${options.repo}.yaml`);
        const data = readShard(repoPath);
        if (!data) {
          errorJson(`No shard found for repo "${options.repo}". Available repos: ${listShardFiles(join(ctxDir, 'repos')).map(f => f.replace('.yaml', '')).join(', ')}`);
        }
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      // Section-based queries
      switch (section) {
        case 'endpoints': {
          if (options.repo) {
            const data = readShard(join(ctxDir, 'endpoints', `${options.repo}.yaml`));
            if (!data) {
              errorJson(`No endpoints shard for repo "${options.repo}".`);
            }
            const filtered = filterEndpoints(
              data as { endpoints?: Array<Record<string, unknown>> },
              options.method,
              options.pathContains,
            );
            console.log(JSON.stringify(filtered, null, 2));
          } else {
            // All endpoints across repos
            const files = listShardFiles(join(ctxDir, 'endpoints'));
            const allEndpoints: Array<Record<string, unknown>> = [];
            for (const file of files) {
              const data = readShard(join(ctxDir, 'endpoints', file)) as {
                repo?: string;
                endpoints?: Array<Record<string, unknown>>;
              } | null;
              if (data?.endpoints) {
                allEndpoints.push(...data.endpoints.map((ep) => ({ ...ep, repo: data.repo })));
              }
            }
            let filtered = allEndpoints;
            if (options.method) {
              filtered = filtered.filter(
                (ep) => typeof ep.method === 'string' && ep.method.toUpperCase() === options.method!.toUpperCase(),
              );
            }
            if (options.pathContains) {
              filtered = filtered.filter(
                (ep) => typeof ep.path === 'string' && (ep.path as string).includes(options.pathContains!),
              );
            }
            console.log(JSON.stringify({ endpoints: filtered }, null, 2));
          }
          break;
        }

        case 'types': {
          const data = readShard(join(ctxDir, 'types', 'shared.yaml'));
          if (!data) {
            errorJson('No types shard found.');
          }
          const filtered = filterTypes(
            data as { shared_types?: Array<Record<string, unknown>> },
            options.name,
          );
          console.log(JSON.stringify(filtered, null, 2));
          break;
        }

        case 'env': {
          const data = readShard(join(ctxDir, 'env', 'all.yaml')) as {
            env_vars?: Array<{ name: string; repos: string[]; sources: unknown[] }>;
          } | null;
          if (!data) {
            errorJson('No env shard found.');
          }
          if (options.repo) {
            const filtered = (data!.env_vars || []).filter((e) => e.repos.includes(options.repo!));
            console.log(JSON.stringify({ env_vars: filtered }, null, 2));
          } else {
            console.log(JSON.stringify(data, null, 2));
          }
          break;
        }

        case 'topology': {
          const data = readShard(join(ctxDir, 'topology', 'graph.yaml'));
          if (!data) {
            errorJson('No topology shard found.');
          }
          console.log(JSON.stringify(data, null, 2));
          break;
        }

        case 'schemas': {
          if (options.repo) {
            const data = readShard(join(ctxDir, 'schemas', `${options.repo}.yaml`));
            if (!data) {
              errorJson(`No schemas shard for repo "${options.repo}".`);
            }
            console.log(JSON.stringify(data, null, 2));
          } else {
            const files = listShardFiles(join(ctxDir, 'schemas'));
            const all: unknown[] = [];
            for (const file of files) {
              const data = readShard(join(ctxDir, 'schemas', file));
              if (data) all.push(data);
            }
            console.log(JSON.stringify({ schemas: all }, null, 2));
          }
          break;
        }

        case 'questions': {
          const data = readShard(join(ctxDir, 'questions', 'pending.yaml'));
          if (!data) {
            errorJson('No questions shard found.');
          }
          console.log(JSON.stringify(data, null, 2));
          break;
        }
      }
    });
}
