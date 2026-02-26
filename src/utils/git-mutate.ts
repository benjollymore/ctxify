import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
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

export async function createBranch(dir: string, name: string): Promise<void> {
  await git(['checkout', '-b', name], dir);
}

export async function hasChanges(dir: string): Promise<boolean> {
  const output = await git(['status', '--porcelain'], dir);
  return output.length > 0;
}

export async function stageAndCommit(dir: string, message: string): Promise<string> {
  await git(['add', '-A'], dir);
  await git(['commit', '-m', message], dir);
  // Return the new commit SHA
  return git(['rev-parse', 'HEAD'], dir);
}

export async function getCurrentBranch(dir: string): Promise<string> {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
}
