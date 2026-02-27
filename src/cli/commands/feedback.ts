import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import {
  generateCorrectionsTemplate,
  formatCorrectionEntry,
  formatAntiPatternEntry,
  ANTI_PATTERNS_SECTION_HEADER,
} from '../../templates/corrections.js';

// ── Command ─────────────────────────────────────────────────────────────

export function registerFeedbackCommand(program: Command): void {
  program
    .command('feedback <repo>')
    .description('Log a correction or anti-pattern')
    .requiredOption('--body <text>', 'Entry body')
    .option('--type <type>', 'Entry type: correction or antipattern', 'correction')
    .option('--source <source>', 'Source file:line reference (for antipatterns)')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(
      async (
        repo: string,
        options: { body: string; type: string; source?: string; dir?: string },
      ) => {
        const workspaceRoot = resolve(options.dir || '.');
        const configPath = join(workspaceRoot, 'ctx.yaml');

        if (!existsSync(configPath)) {
          console.log(JSON.stringify({ error: 'No ctx.yaml found. Run "ctxify init" first.' }));
          process.exit(1);
        }

        const entryType = options.type;
        if (entryType !== 'correction' && entryType !== 'antipattern') {
          console.log(
            JSON.stringify({
              error: `Invalid --type "${entryType}". Must be "correction" or "antipattern".`,
            }),
          );
          process.exit(1);
        }

        const config = loadConfig(configPath);
        const outputDir = config.options.outputDir || '.ctxify';

        // Validate repo exists
        const repoEntry = config.repos.find((r) => r.name === repo);
        if (!repoEntry) {
          console.log(
            JSON.stringify({
              error: `Repo "${repo}" not found in ctx.yaml. Available repos: ${config.repos.map((r) => r.name).join(', ')}`,
            }),
          );
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

        let current = readFileSync(correctionsPath, 'utf-8');

        if (entryType === 'antipattern') {
          if (!current.includes('# Anti-Patterns')) {
            current = current + ANTI_PATTERNS_SECTION_HEADER;
          }
          const entry = formatAntiPatternEntry({
            body: options.body,
            source: options.source,
            timestamp,
          });
          writeFileSync(correctionsPath, current + entry, 'utf-8');
        } else {
          const entry = formatCorrectionEntry({ body: options.body, timestamp });
          writeFileSync(correctionsPath, current + entry, 'utf-8');
        }

        console.log(
          JSON.stringify(
            {
              status: 'recorded',
              type: entryType,
              repo,
              path: correctionsPath,
              timestamp,
              created_file: createdFile,
            },
            null,
            2,
          ),
        );
      },
    );
}
