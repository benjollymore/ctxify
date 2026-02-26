import { Command } from 'commander';
import { registerInitCommand } from '../src/cli/commands/init.js';
import { registerStatusCommand } from '../src/cli/commands/status.js';
import { registerValidateCommand } from '../src/cli/commands/validate.js';
import { registerBranchCommand } from '../src/cli/commands/branch.js';
import { registerCommitCommand } from '../src/cli/commands/commit.js';

const program = new Command();

program
  .name('ctxify')
  .description('Context layer for AI coding agents — a turbocharged CLAUDE.md for multi-repo workspaces')
  .version('2.0.0');

registerInitCommand(program);
registerStatusCommand(program);
registerValidateCommand(program);
registerBranchCommand(program);
registerCommitCommand(program);

program.parse();
