import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function hashString(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export function hashFileSet(filePaths: string[]): string {
  const hash = createHash('sha256');
  for (const filePath of filePaths.sort()) {
    try {
      hash.update(filePath);
      hash.update(readFileSync(filePath));
    } catch {
      // skip missing files
    }
  }
  return hash.digest('hex');
}
