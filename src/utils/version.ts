import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Returns the current ctxify version.
 * Reads `process.env.CTXIFY_CURRENT_VERSION` (set by the CLI entry point),
 * falling back to a package.json walk-up from this file's directory.
 */
export function getCtxifyVersion(): string {
  if (process.env.CTXIFY_CURRENT_VERSION) {
    return process.env.CTXIFY_CURRENT_VERSION;
  }

  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    try {
      const content = readFileSync(join(dir, 'package.json'), 'utf-8');
      return JSON.parse(content).version || '0.0.0';
    } catch {
      dir = dirname(dir);
    }
  }
  return '0.0.0';
}
