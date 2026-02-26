import type { Command } from 'commander';
import { resolve } from 'node:path';
import { validateShards } from '../../core/validate.js';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Validate structural integrity of .ctxify shards')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { dir?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const result = validateShards(workspaceRoot);
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exit(1);
    });
}
