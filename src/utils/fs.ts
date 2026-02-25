import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function readFileIfExists(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function readJsonFile<T = unknown>(filePath: string): T | null {
  const content = readFileIfExists(filePath);
  if (content === null) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function findFiles(
  dir: string,
  predicate: (name: string, path: string) => boolean,
  options: { maxDepth?: number; exclude?: string[] } = {},
): string[] {
  const { maxDepth = 10, exclude = ['node_modules', '.git', 'dist', 'build'] } = options;
  const results: string[] = [];

  function walk(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (exclude.includes(entry)) continue;
      const fullPath = join(currentDir, entry);

      if (isDirectory(fullPath)) {
        walk(fullPath, depth + 1);
      } else if (predicate(entry, fullPath)) {
        results.push(fullPath);
      }
    }
  }

  walk(resolve(dir), 0);
  return results;
}

export function listDirs(dir: string, exclude: string[] = ['node_modules', '.git', 'dist', 'build']): string[] {
  try {
    return readdirSync(dir)
      .filter((entry) => !exclude.includes(entry) && isDirectory(join(dir, entry)))
      .map((entry) => join(dir, entry));
  } catch {
    return [];
  }
}
