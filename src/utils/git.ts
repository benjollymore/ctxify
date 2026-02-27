import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function findGitRoots(dir: string, maxDepth = 2): string[] {
  const roots: string[] = [];

  function walk(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;
    if (existsSync(join(currentDir, '.git'))) {
      roots.push(currentDir);
      return;
    }

    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', 'build'].includes(entry)) continue;
      const fullPath = join(currentDir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          walk(fullPath, depth + 1);
        }
      } catch {
        // skip inaccessible dirs
      }
    }
  }

  walk(dir, 0);
  return roots;
}
