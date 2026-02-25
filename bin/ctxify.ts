import { Command } from 'commander';
import { registerInitCommand } from '../src/cli/commands/init.js';
import { registerScanCommand } from '../src/cli/commands/scan.js';
import { registerStatusCommand } from '../src/cli/commands/status.js';
import { registerQueryCommand } from '../src/cli/commands/query.js';

const program = new Command();

program
  .name('ctxify')
  .description('Multi-repo context compiler for AI coding agents')
  .version('2.0.0');

registerInitCommand(program);
registerScanCommand(program);
registerStatusCommand(program);
registerQueryCommand(program);

program.parse();
