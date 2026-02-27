import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { loadConfig } from '../../core/config.js';
import { parseFrontmatter } from '../../utils/frontmatter.js';
import { generateDomainTemplate } from '../../templates/domain.js';

// ── Validation ───────────────────────────────────────────────────────────

const DOMAIN_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isValidDomainName(name: string): boolean {
  return DOMAIN_NAME_PATTERN.test(name);
}

// ── Overview update logic ────────────────────────────────────────────────

function updateOverviewDomainIndex(
  overviewPath: string,
  domain: string,
  description?: string,
): boolean {
  if (!existsSync(overviewPath)) return false;

  let content = readFileSync(overviewPath, 'utf-8');
  const entry = `- \`${domain}.md\`${description ? ` — ${description}` : ''}`;

  // Find domain-index markers
  const markerStart = '<!-- domain-index -->';
  const markerEnd = '<!-- /domain-index -->';
  const startIdx = content.indexOf(markerStart);
  const endIdx = content.indexOf(markerEnd);

  if (startIdx === -1 || endIdx === -1) {
    // Fallback: append to end of Context section
    const contextIdx = content.indexOf('## Context');
    if (contextIdx === -1) {
      // No Context section — append to end of file
      content = content.trimEnd() + '\n\n' + entry + '\n';
    } else {
      // Append after the Context section (before next ## or end of file)
      const nextSection = content.indexOf('\n## ', contextIdx + 1);
      const insertPos = nextSection === -1 ? content.length : nextSection;
      content = content.slice(0, insertPos).trimEnd() + '\n\n' + entry + '\n' + content.slice(insertPos);
    }
    writeFileSync(overviewPath, content, 'utf-8');
    return true;
  }

  // Extract block between markers
  const blockStart = startIdx + markerStart.length;
  const block = content.slice(blockStart, endIdx);

  // Check if domain already listed
  const domainEntryPattern = new RegExp(`^\\s*-\\s*\`${domain}\\.md\``, 'm');
  if (domainEntryPattern.test(block)) {
    return false; // Already listed
  }

  // Build new block: existing real entries + new entry, no TODO comment
  const lines = block.split('\n');
  const existingEntries = lines.filter((line) => /^\s*-\s*`[^`]+\.md`/.test(line));
  existingEntries.push(entry);

  const newBlock = '\n' + existingEntries.join('\n') + '\n';
  content = content.slice(0, blockStart) + newBlock + content.slice(endIdx);

  writeFileSync(overviewPath, content, 'utf-8');
  return true;
}

// ── Commands ─────────────────────────────────────────────────────────────

export function registerDomainCommand(program: Command): void {
  const domain = program
    .command('domain')
    .description('Manage domain context files');

  // ── domain add ──
  domain
    .command('add <repo> <domain-name>')
    .description('Register a domain file with TODO placeholders')
    .option('--tags <tags...>', 'Tags for frontmatter')
    .option('--description <text>', 'One-line description')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (repo: string, domainName: string, options: {
      tags?: string[];
      description?: string;
      dir?: string;
    }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run "ctxify init" first.' }));
        process.exit(1);
      }

      // Validate domain name
      if (!isValidDomainName(domainName)) {
        console.log(JSON.stringify({
          error: `Invalid domain name "${domainName}". Must be lowercase alphanumeric with hyphens only.`,
        }));
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

      // Parse tags from comma-separated string if needed
      const tags = options.tags
        ? options.tags.flatMap((t) => t.split(',').map((s) => s.trim()).filter(Boolean))
        : undefined;

      const repoDir = join(workspaceRoot, outputDir, 'repos', repo);
      const domainPath = join(repoDir, `${domainName}.md`);
      const overviewPath = join(repoDir, 'overview.md');

      let fileExisted = false;

      if (existsSync(domainPath)) {
        fileExisted = true;
      } else {
        // Create domain file
        mkdirSync(repoDir, { recursive: true });
        const content = generateDomainTemplate({
          repo,
          domain: domainName,
          tags,
          description: options.description,
        });
        writeFileSync(domainPath, content, 'utf-8');
      }

      // Update overview.md domain index
      const overviewUpdated = updateOverviewDomainIndex(overviewPath, domainName, options.description);

      const result = {
        status: 'registered',
        repo,
        domain: domainName,
        path: domainPath,
        file_existed: fileExisted,
        overview_updated: overviewUpdated,
      };

      console.log(JSON.stringify(result, null, 2));
    });

  // ── domain list ──
  domain
    .command('list')
    .description('List registered domain files')
    .option('--repo <name>', 'Filter by repo name')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .action(async (options: { repo?: string; dir?: string }) => {
      const workspaceRoot = resolve(options.dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      if (!existsSync(configPath)) {
        console.log(JSON.stringify({ error: 'No ctx.yaml found. Run "ctxify init" first.' }));
        process.exit(1);
      }

      const config = loadConfig(configPath);
      const outputDir = config.options.outputDir || '.ctxify';

      const repos = options.repo
        ? config.repos.filter((r) => r.name === options.repo)
        : config.repos;

      if (options.repo && repos.length === 0) {
        console.log(JSON.stringify({
          error: `Repo "${options.repo}" not found in ctx.yaml.`,
        }));
        process.exit(1);
      }

      const result: Record<string, Array<{ domain: string; tags: string[]; path: string }>> = {};

      for (const repo of repos) {
        const repoDir = join(workspaceRoot, outputDir, 'repos', repo.name);
        if (!existsSync(repoDir)) {
          result[repo.name] = [];
          continue;
        }

        const domains: Array<{ domain: string; tags: string[]; path: string }> = [];

        let entries: string[];
        try {
          entries = readdirSync(repoDir);
        } catch {
          result[repo.name] = [];
          continue;
        }

        for (const entry of entries) {
          if (!entry.endsWith('.md') || entry === 'overview.md' || entry === 'patterns.md' || entry === 'corrections.md') {
            continue;
          }

          const filePath = join(repoDir, entry);
          const content = readFileSync(filePath, 'utf-8');
          const fm = parseFrontmatter(content);

          if (fm && fm.type === 'domain') {
            domains.push({
              domain: (fm.domain as string) || entry.replace('.md', ''),
              tags: Array.isArray(fm.tags) ? fm.tags.filter((t): t is string => typeof t === 'string') : [],
              path: filePath,
            });
          }
        }

        result[repo.name] = domains;
      }

      console.log(JSON.stringify({ repos: result }, null, 2));
    });
}
