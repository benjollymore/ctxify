import type { Command } from 'commander';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Full analysis pipeline -> write all output files')
    .option('--with-answers', 'Incorporate answers from .ctx/answers.yaml')
    .action(async (options: { withAnswers?: boolean }) => {
      console.error('generate command not yet implemented');
      process.exit(1);
    });
}
