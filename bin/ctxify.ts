import { Command } from 'commander';
import { registerInitCommand } from '../src/cli/commands/init.js';
import { registerGenerateCommand } from '../src/cli/commands/generate.js';
import { registerRefreshCommand } from '../src/cli/commands/refresh.js';
import { registerStatusCommand } from '../src/cli/commands/status.js';

const program = new Command();

program
  .name('ctxify')
  .description('Multi-repo context compiler for AI coding agents')
  .version('0.1.0');

registerInitCommand(program);
registerGenerateCommand(program);
registerRefreshCommand(program);
registerStatusCommand(program);

program.parse();
