import type { Command } from 'commander';
import { resolve } from 'node:path';
import { auditShards } from '../../core/audit.js';

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .description('Quality analysis of .ctxify context shards')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .option('--repo <name>', 'Audit a single repo only')
    .action(async (options: { dir?: string; repo?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const result = auditShards(workspaceRoot, undefined, options.repo);
      console.log(JSON.stringify(result, null, 2));
    });
}
