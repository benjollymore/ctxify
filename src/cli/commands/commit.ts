import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { hasChanges, stageAndCommit } from '../../utils/git-mutate.js';

export function registerCommitCommand(program: Command): void {
  program
    .command('commit <message>')
    .description('Stage and commit in all repos with changes (multi-repo only)')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (message: string, options: { dir?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run ctxify init first.' }));
        process.exit(1);
      }

      const config = loadConfig(configPath);

      if (config.mode !== 'multi-repo') {
        console.log(JSON.stringify({
          error: `"commit" command is only available in multi-repo mode (current mode: ${config.mode})`,
        }));
        process.exit(1);
      }

      const results: Array<{ repo: string; status: string; sha?: string; error?: string }> = [];

      for (const entry of config.repos) {
        const repoPath = resolve(workspaceRoot, entry.path);

        try {
          const dirty = await hasChanges(repoPath);
          if (!dirty) {
            results.push({ repo: entry.name, status: 'clean' });
            continue;
          }

          const sha = await stageAndCommit(repoPath, message);
          results.push({ repo: entry.name, status: 'committed', sha });
        } catch (err) {
          results.push({
            repo: entry.name,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      console.log(JSON.stringify({ message, repos: results }, null, 2));
    });
}
