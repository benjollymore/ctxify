import jsYaml from 'js-yaml';

export function parseYaml<T = unknown>(content: string): T {
  return jsYaml.load(content) as T;
}

export function dumpYaml(data: unknown, options?: jsYaml.DumpOptions): string {
  return jsYaml.dump(data, { lineWidth: 120, noRefs: true, ...options });
}
