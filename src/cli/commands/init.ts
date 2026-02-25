import type { Command } from 'commander';
import { resolve, join, basename, relative } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { loadConfig, generateDefaultConfig, serializeConfig } from '../../core/config.js';
import type { RepoEntry } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { findGitRoots } from '../../utils/git.js';
import { readJsonFile } from '../../utils/fs.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init [dir]')
    .description('Auto-detect repos, create ctx.yaml, run first generation')
    .option('-f, --force', 'Overwrite existing ctx.yaml')
    .action(async (dir?: string, options?: { force?: boolean }) => {
      const logger = createLogger('info');
      const workspaceRoot = resolve(dir || '.');

      const configPath = join(workspaceRoot, 'ctx.yaml');
      if (existsSync(configPath) && !options?.force) {
        logger.error(`ctx.yaml already exists in ${workspaceRoot}. Use --force to overwrite.`);
        process.exit(1);
      }

      logger.info(`Scanning ${workspaceRoot} for repositories...`);

      // Find git repos
      const gitRoots = findGitRoots(workspaceRoot, 3);
      const workspaceAbs = resolve(workspaceRoot);
      const subRepos = gitRoots.filter((root) => resolve(root) !== workspaceAbs);
      const repoRoots = subRepos.length > 0 ? subRepos : gitRoots;

      if (repoRoots.length === 0) {
        logger.warn('No git repositories found. Creating config with empty repos list.');
      }

      // Build repo entries
      const repos: RepoEntry[] = repoRoots.map((root) => {
        const name = basename(root);
        const relPath = relative(workspaceRoot, root) || '.';
        const entry: RepoEntry = { path: relPath, name };

        // Try to detect language/framework from package.json
        const pkg = readJsonFile<{ description?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(join(root, 'package.json'));
        if (pkg) {
          entry.language = 'typescript';
          entry.description = pkg.description;
        }

        return entry;
      });

      // Generate and write config
      const config = generateDefaultConfig(workspaceRoot, repos);
      writeFileSync(configPath, serializeConfig(config), 'utf-8');
      logger.info(`Created ${configPath} with ${repos.length} repos`);

      // Print summary
      for (const repo of repos) {
        logger.info(`  - ${repo.name} (${repo.path})`);
      }

      // Run generate
      logger.info('Running initial generation...');

      // Dynamic import to avoid circular dependencies at load time
      const { registerGenerateCommand } = await import('./generate.js');
      const { Command: Cmd } = await import('commander');
      const genProg = new Cmd();
      registerGenerateCommand(genProg);

      // Simulate running generate with the same directory
      const genCmd = genProg.commands.find((c) => c.name() === 'generate');
      if (genCmd) {
        await genCmd.parseAsync(['--dir', workspaceRoot], { from: 'user' });
      }

      logger.info('Initialization complete!');
    });
}
