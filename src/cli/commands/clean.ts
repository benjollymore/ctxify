import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

export function registerCleanCommand(program: Command): void {
  program
    .command('clean [dir]')
    .description('Remove .ctxify/ and ctx.yaml from workspace')
    .action((dir?: string) => {
      const workspaceRoot = resolve(dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');
      const outputDir = join(workspaceRoot, '.ctxify');

      const removed: string[] = [];

      if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
        removed.push('.ctxify/');
      }

      if (existsSync(configPath)) {
        rmSync(configPath);
        removed.push('ctx.yaml');
      }

      console.log(JSON.stringify({ removed, workspace: workspaceRoot }));
    });
}
