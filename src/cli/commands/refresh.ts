import type { Command } from 'commander';

export function registerRefreshCommand(program: Command): void {
  program
    .command('refresh')
    .description('Diff-aware incremental update (only stale files)')
    .action(async () => {
      console.error('refresh command not yet implemented');
      process.exit(1);
    });
}
