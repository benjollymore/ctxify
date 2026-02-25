import type { Command } from 'commander';

export function registerInitCommand(program: Command): void {
  program
    .command('init [dir]')
    .description('Auto-detect repos, create ctx.yaml, run first generation')
    .action(async (dir?: string) => {
      console.error('init command not yet implemented');
      process.exit(1);
    });
}
