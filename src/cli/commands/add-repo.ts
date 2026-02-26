import type { Command } from 'commander';
import { resolve, join, relative, basename, isAbsolute } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { loadConfig, serializeConfig } from '../../core/config.js';
import type { RepoEntry } from '../../core/config.js';
import { readJsonFile } from '../../utils/fs.js';

export function registerAddRepoCommand(program: Command): void {
  program
    .command('add-repo <path>')
    .description('Add a repo to existing multi-repo config')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .option('--name <name>', 'Override repo name')
    .option('--scan', 'Run scan after adding')
    .action(async (repoPath: string, options: { dir?: string; name?: string; scan?: boolean }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run ctxify init first.' }));
        process.exit(1);
      }

      const config = loadConfig(configPath);

      if (config.mode !== 'multi-repo') {
        console.log(JSON.stringify({
          error: `"add-repo" command is only available in multi-repo mode (current mode: ${config.mode})`,
        }));
        process.exit(1);
      }

      const absRepoPath = resolve(workspaceRoot, repoPath);

      // Validate: path exists
      if (!existsSync(absRepoPath)) {
        console.log(JSON.stringify({ error: `Path does not exist: ${absRepoPath}` }));
        process.exit(1);
      }

      // Validate: has .git
      if (!existsSync(join(absRepoPath, '.git'))) {
        console.log(JSON.stringify({ error: `No .git found in ${absRepoPath}` }));
        process.exit(1);
      }

      // Compute path: relative if under workspace root, absolute otherwise
      const relPath = relative(workspaceRoot, absRepoPath);
      const isUnderRoot = !relPath.startsWith('..');
      const configRepoPath = isUnderRoot ? relPath : absRepoPath;

      // Validate: not duplicate
      const isDuplicate = config.repos.some(
        (r) => resolve(workspaceRoot, r.path) === absRepoPath,
      );
      if (isDuplicate) {
        console.log(JSON.stringify({ error: `Repo already in config: ${absRepoPath}` }));
        process.exit(1);
      }

      // Build entry
      const name = options.name || basename(absRepoPath);
      const entry: RepoEntry = { path: configRepoPath, name };

      // Detect language from package.json
      const pkg = readJsonFile<{ description?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
        join(absRepoPath, 'package.json'),
      );
      if (pkg) {
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        entry.language = allDeps['typescript'] ? 'typescript' : 'javascript';
        entry.description = pkg.description;
      }

      // Update config
      config.repos.push(entry);
      writeFileSync(configPath, serializeConfig(config), 'utf-8');

      const result: Record<string, unknown> = {
        status: 'added',
        repo: { name: entry.name, path: entry.path, language: entry.language },
        total_repos: config.repos.length,
      };

      console.log(JSON.stringify(result, null, 2));
    });
}
