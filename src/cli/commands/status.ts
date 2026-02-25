import type { Command } from 'commander';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show which context files are stale vs current')
    .action(async () => {
      console.error('status command not yet implemented');
      process.exit(1);
    });
}
