import { readFileSync, existsSync } from 'node:fs';
import { parseYaml, dumpYaml } from '../utils/yaml.js';
import { ConfigError } from './errors.js';

export type OperatingMode = 'single-repo' | 'multi-repo' | 'mono-repo';

export interface MonoRepoOptions {
  manager?: string; // 'npm' | 'yarn' | 'pnpm' | 'turborepo'
  packageGlobs?: string[]; // from package.json workspaces field
}

export interface RepoEntry {
  path: string;
  name: string;
  language?: string;
  framework?: string;
  description?: string;
  include?: string[];
  exclude?: string[];
}

export interface Relationship {
  from: string;
  to: string;
  type: 'dependency' | 'api-consumer' | 'shared-db' | 'shared-types' | 'event';
  description?: string;
}

export interface ContextOptions {
  outputDir?: string;
  maxFileSize?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface CtxConfig {
  version: string;
  workspace: string;
  mode: OperatingMode;
  monoRepo?: MonoRepoOptions;
  repos: RepoEntry[];
  relationships: Relationship[];
  options: ContextOptions;
  skills?: Record<string, string>;
  install_method?: 'global' | 'local' | 'npx';
}

const DEFAULT_OPTIONS: ContextOptions = {
  outputDir: '.ctxify',
  maxFileSize: 100_000,
  maxDepth: 5,
  includePatterns: [],
  excludePatterns: [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '__pycache__',
    '.venv',
    'fixtures',
    '__fixtures__',
  ],
};

export function loadConfig(configPath: string): CtxConfig {
  if (!existsSync(configPath)) {
    throw new ConfigError(`Config file not found: ${configPath}`);
  }

  let raw: unknown;
  try {
    const content = readFileSync(configPath, 'utf-8');
    raw = parseYaml(content);
  } catch (err) {
    throw new ConfigError(
      `Failed to parse config: ${configPath}`,
      err instanceof Error ? err : undefined,
    );
  }

  return validateConfig(raw);
}

function validateConfig(raw: unknown): CtxConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigError('Config must be a YAML object');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.version !== 'string') {
    throw new ConfigError('Config must have a "version" string field');
  }

  if (typeof obj.workspace !== 'string') {
    throw new ConfigError('Config must have a "workspace" string field');
  }

  const mode = validateMode(obj.mode);
  const monoRepo = mode === 'mono-repo' ? validateMonoRepoOptions(obj.monoRepo) : undefined;
  const repos = validateRepos(obj.repos);
  const relationships = validateRelationships(obj.relationships);
  const options = validateOptions(obj.options);
  const skills = validateSkills(obj.skills);
  const install_method = validateInstallMethod(obj.install_method);

  return {
    version: obj.version,
    workspace: obj.workspace,
    mode,
    ...(monoRepo ? { monoRepo } : {}),
    repos,
    relationships,
    options,
    ...(skills ? { skills } : {}),
    ...(install_method ? { install_method } : {}),
  };
}

const VALID_MODES: OperatingMode[] = ['single-repo', 'multi-repo', 'mono-repo'];

function validateMode(raw: unknown): OperatingMode {
  if (raw === undefined || raw === null) return 'multi-repo'; // backward compat default
  if (typeof raw !== 'string' || !VALID_MODES.includes(raw as OperatingMode)) {
    throw new ConfigError(`"mode" must be one of: ${VALID_MODES.join(', ')}`);
  }
  return raw as OperatingMode;
}

function validateMonoRepoOptions(raw: unknown): MonoRepoOptions | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') {
    throw new ConfigError('"monoRepo" must be an object');
  }
  const o = raw as Record<string, unknown>;
  return {
    manager: typeof o.manager === 'string' ? o.manager : undefined,
    packageGlobs: Array.isArray(o.packageGlobs)
      ? o.packageGlobs.filter((s): s is string => typeof s === 'string')
      : undefined,
  };
}

function validateRepos(raw: unknown): RepoEntry[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new ConfigError('"repos" must be an array');
  }

  return raw.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new ConfigError(`repos[${i}] must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== 'string') {
      throw new ConfigError(`repos[${i}].path must be a string`);
    }
    if (typeof e.name !== 'string') {
      throw new ConfigError(`repos[${i}].name must be a string`);
    }
    return {
      path: e.path,
      name: e.name,
      language: typeof e.language === 'string' ? e.language : undefined,
      framework: typeof e.framework === 'string' ? e.framework : undefined,
      description: typeof e.description === 'string' ? e.description : undefined,
      include: Array.isArray(e.include)
        ? e.include.filter((s): s is string => typeof s === 'string')
        : undefined,
      exclude: Array.isArray(e.exclude)
        ? e.exclude.filter((s): s is string => typeof s === 'string')
        : undefined,
    };
  });
}

function validateRelationships(raw: unknown): Relationship[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new ConfigError('"relationships" must be an array');
  }

  const validTypes = ['dependency', 'api-consumer', 'shared-db', 'shared-types', 'event'];

  return raw.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new ConfigError(`relationships[${i}] must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.from !== 'string') {
      throw new ConfigError(`relationships[${i}].from must be a string`);
    }
    if (typeof e.to !== 'string') {
      throw new ConfigError(`relationships[${i}].to must be a string`);
    }
    if (typeof e.type !== 'string' || !validTypes.includes(e.type)) {
      throw new ConfigError(`relationships[${i}].type must be one of: ${validTypes.join(', ')}`);
    }
    return {
      from: e.from,
      to: e.to,
      type: e.type as Relationship['type'],
      description: typeof e.description === 'string' ? e.description : undefined,
    };
  });
}

function validateSkills(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError('"skills" must be an object mapping agent names to paths');
  }
  const o = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(o)) {
    if (typeof val !== 'string') {
      throw new ConfigError(`skills.${key} must be a string`);
    }
    result[key] = val;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function validateInstallMethod(raw: unknown): 'global' | 'local' | 'npx' | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (raw !== 'global' && raw !== 'local' && raw !== 'npx') {
    throw new ConfigError(
      `"install_method" must be one of: global, local, npx (got "${String(raw)}")`,
    );
  }
  return raw;
}

function validateOptions(raw: unknown): ContextOptions {
  if (raw === undefined || raw === null) return { ...DEFAULT_OPTIONS };
  if (typeof raw !== 'object') {
    throw new ConfigError('"options" must be an object');
  }
  const o = raw as Record<string, unknown>;
  return {
    outputDir: typeof o.outputDir === 'string' ? o.outputDir : DEFAULT_OPTIONS.outputDir,
    maxFileSize: typeof o.maxFileSize === 'number' ? o.maxFileSize : DEFAULT_OPTIONS.maxFileSize,
    maxDepth: typeof o.maxDepth === 'number' ? o.maxDepth : DEFAULT_OPTIONS.maxDepth,
    includePatterns: Array.isArray(o.includePatterns)
      ? o.includePatterns.filter((s): s is string => typeof s === 'string')
      : DEFAULT_OPTIONS.includePatterns,
    excludePatterns: Array.isArray(o.excludePatterns)
      ? o.excludePatterns.filter((s): s is string => typeof s === 'string')
      : DEFAULT_OPTIONS.excludePatterns,
  };
}

export function generateDefaultConfig(
  workspacePath: string,
  repos: RepoEntry[],
  mode: OperatingMode = 'multi-repo',
  monoRepoOptions?: MonoRepoOptions,
  relationships?: Relationship[],
  skills?: Record<string, string>,
  install_method?: 'global' | 'local' | 'npx',
): CtxConfig {
  return {
    version: '1',
    workspace: workspacePath,
    mode,
    ...(monoRepoOptions ? { monoRepo: monoRepoOptions } : {}),
    repos,
    relationships: relationships ?? [],
    options: { ...DEFAULT_OPTIONS },
    ...(skills ? { skills } : {}),
    ...(install_method ? { install_method } : {}),
  };
}

export function serializeConfig(config: CtxConfig): string {
  return dumpYaml(config);
}
