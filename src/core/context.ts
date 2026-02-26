export interface RepoInfo {
  name: string;
  path: string;
  language: string;
  framework: string;
  description: string;
  entryPoints: string[];
  keyDirs: string[];
  fileCount: number;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  manifestType: string;
}

export interface ApiEndpoint {
  repo: string;
  method: string;
  path: string;
  file: string;
  line?: number;
  handler?: string;
  requestType?: string;
  responseType?: string;
}

export interface SharedType {
  name: string;
  kind: 'interface' | 'type' | 'enum' | 'class' | 'function' | 'const';
  definedIn: string;
  file: string;
  usedBy: string[];
  properties?: string[];
}

export interface EnvVar {
  name: string;
  repos: string[];
  sources: Array<{ repo: string; file: string; type: 'env-file' | 'code-reference' | 'docker-compose' }>;
}

export interface InferredRelationship {
  from: string;
  to: string;
  type: 'dependency' | 'api-consumer' | 'shared-db' | 'shared-types' | 'event' | 'workspace';
  evidence: string;
  confidence: number;
}

export interface Convention {
  repo: string;
  category: 'naming' | 'structure' | 'tooling' | 'testing' | 'style';
  pattern: string;
  description: string;
}

export interface DbSchema {
  repo: string;
  orm: string;
  file: string;
  models: Array<{
    name: string;
    fields: Array<{ name: string; type: string }>;
    relations?: Array<{ name: string; target: string; type: string }>;
  }>;
}

export interface Question {
  id: string;
  pass: string;
  category: 'relationship' | 'framework' | 'api' | 'type' | 'env';
  question: string;
  context: string;
  confidence: number;
}

