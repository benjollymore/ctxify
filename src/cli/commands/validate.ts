import type { Command } from 'commander';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { validateShards, validateMultiRepoShards } from '../../core/validate.js';
import { loadConfig } from '../../core/config.js';
import { resolveWorkspaceRootOrThrow } from '../../core/paths.js';
import { ConfigError } from '../../core/errors.js';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Validate structural integrity of .ctxify shards')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { dir?: string }) => {
      let workspaceRoot: string;
      try {
        const resolved = resolveWorkspaceRootOrThrow(options.dir);
        workspaceRoot = resolved.root;
        if (resolved.fromParent) {
          console.error(`Warning: Running from sub-repo. Using workspace root at ${resolved.root}.`);
        }
      } catch (e) {
        if (e instanceof ConfigError) {
          console.log(JSON.stringify({ error: e.message }));
          process.exit(1);
        }
        throw e;
      }

      // Check if multi-repo mode — use per-repo validation
      const configPath = join(workspaceRoot, 'ctx.yaml');
      if (existsSync(configPath)) {
        try {
          const config = loadConfig(configPath);
          if (config.mode === 'multi-repo') {
            const result = validateMultiRepoShards(workspaceRoot, config);
            console.log(JSON.stringify(result, null, 2));
            if (!result.valid) process.exit(1);
            return;
          }
        } catch {
          // Fall through to standard validation
        }
      }

      const result = validateShards(workspaceRoot);
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exit(1);
    });
}
