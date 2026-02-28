// Polyfill Array.prototype.findLastIndex for Node 18 (ES2023 method used by @inquirer/select)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(Array.prototype as any).findLastIndex) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Array.prototype as any).findLastIndex = function (
    predicate: (value: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ): number {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  };
}

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerInitCommand } from '../src/cli/commands/init.js';
import { registerStatusCommand } from '../src/cli/commands/status.js';
import { registerValidateCommand } from '../src/cli/commands/validate.js';
import { registerBranchCommand } from '../src/cli/commands/branch.js';
import { registerCommitCommand } from '../src/cli/commands/commit.js';
import { registerCleanCommand } from '../src/cli/commands/clean.js';
import { registerDomainCommand } from '../src/cli/commands/domain.js';
import { registerFeedbackCommand } from '../src/cli/commands/feedback.js';
import { registerUpgradeCommand } from '../src/cli/commands/upgrade.js';
import { registerPatternsCommand } from '../src/cli/commands/patterns.js';
import { checkForUpdate } from '../src/utils/version-check.js';

function findPackageJson(): { version: string } {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, 'utf-8'));
    }
    dir = dirname(dir);
  }
  return { version: '0.0.0' };
}

const pkg = findPackageJson();

// Expose current version for upgrade command
process.env.CTXIFY_CURRENT_VERSION = pkg.version;

const program = new Command();

program
  .name('ctxify')
  .description('Turbocharged workspace context for AI coding agents')
  .version(pkg.version);

// Non-blocking version check warning before each command
program.hook('preAction', async () => {
  if (process.env.CI || process.env.CTXIFY_NO_UPDATE_CHECK) return;
  const latest = await checkForUpdate(pkg.version);
  if (latest) {
    const hint = process.argv[1]?.includes('_npx')
      ? `run npx @benjollymore/ctxify@latest to use the latest version`
      : `run ctxify upgrade to update`;
    console.error(`warn: ctxify is out of date (latest v${latest}, on v${pkg.version}). ${hint}`);
  }
});

registerInitCommand(program);
registerStatusCommand(program);
registerValidateCommand(program);
registerBranchCommand(program);
registerCommitCommand(program);
registerCleanCommand(program);
registerDomainCommand(program);
registerPatternsCommand(program);
registerFeedbackCommand(program);
registerUpgradeCommand(program);

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.log(JSON.stringify({ error: message }));
  process.exit(1);
});
