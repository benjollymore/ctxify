import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { createBranch, getCurrentBranch } from '../../utils/git-mutate.js';

export function registerBranchCommand(program: Command): void {
  program
    .command('branch <name>')
    .description('Create matching branch in all configured repos (multi-repo only)')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (name: string, options: { dir?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run "ctxify init" first.' }));
        process.exit(1);
      }

      const config = loadConfig(configPath);

      if (config.mode !== 'multi-repo') {
        console.log(
          JSON.stringify({
            error: `"branch" command is only available in multi-repo mode (current mode: ${config.mode})`,
          }),
        );
        process.exit(1);
      }

      const results: Array<{
        repo: string;
        status: string;
        previousBranch?: string;
        error?: string;
      }> = [];

      for (const entry of config.repos) {
        const repoPath = resolve(workspaceRoot, entry.path);

        try {
          const previousBranch = await getCurrentBranch(repoPath);
          await createBranch(repoPath, name);
          results.push({ repo: entry.name, status: 'created', previousBranch });
        } catch (err) {
          results.push({
            repo: entry.name,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      console.log(JSON.stringify({ branch: name, repos: results }, null, 2));
    });
}
