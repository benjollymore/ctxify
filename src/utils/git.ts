import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GitError } from '../core/errors.js';

const execFile = promisify(execFileCb);

async function git(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (err) {
    throw new GitError(
      `git ${args.join(' ')} failed in ${cwd}: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined,
    );
  }
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--is-inside-work-tree'], dir);
    return true;
  } catch {
    return false;
  }
}

export async function getHeadSha(dir: string): Promise<string> {
  return git(['rev-parse', 'HEAD'], dir);
}

export async function getDiff(dir: string, fromSha: string, toSha = 'HEAD'): Promise<string> {
  return git(['diff', '--name-only', fromSha, toSha], dir);
}

export async function getTrackedFiles(dir: string): Promise<string[]> {
  const output = await git(['ls-files'], dir);
  return output ? output.split('\n') : [];
}

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
