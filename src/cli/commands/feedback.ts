import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { generateCorrectionsTemplate, formatCorrectionEntry } from '../../templates/corrections.js';

// ── Command ─────────────────────────────────────────────────────────────

export function registerFeedbackCommand(program: Command): void {
  program
    .command('feedback <repo>')
    .description('Log a correction to prevent repeating mistakes')
    .requiredOption('--body <text>', 'Correction body (what happened, what is correct, why)')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (repo: string, options: { body: string; dir?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run "ctxify init" first.' }));
        process.exit(1);
      }

      const config = loadConfig(configPath);
      const outputDir = config.options.outputDir || '.ctxify';

      // Validate repo exists
      const repoEntry = config.repos.find((r) => r.name === repo);
      if (!repoEntry) {
        console.log(JSON.stringify({
          error: `Repo "${repo}" not found in ctx.yaml. Available repos: ${config.repos.map((r) => r.name).join(', ')}`,
        }));
        process.exit(1);
      }

      const repoDir = join(workspaceRoot, outputDir, 'repos', repo);
      const correctionsPath = join(repoDir, 'corrections.md');
      const timestamp = new Date().toISOString();

      let createdFile = false;

      if (!existsSync(correctionsPath)) {
        mkdirSync(repoDir, { recursive: true });
        writeFileSync(correctionsPath, generateCorrectionsTemplate({ repo }), 'utf-8');
        createdFile = true;
      }

      // Append correction entry
      const current = readFileSync(correctionsPath, 'utf-8');
      const entry = formatCorrectionEntry({ body: options.body, timestamp });
      writeFileSync(correctionsPath, current + entry, 'utf-8');

      console.log(JSON.stringify({
        status: 'recorded',
        repo,
        path: correctionsPath,
        timestamp,
        created_file: createdFile,
      }, null, 2));
    });
}
