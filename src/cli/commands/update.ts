import type { Command } from 'commander';
import { resolve, join, basename } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig, serializeConfig } from '../../core/config.js';
import type { RepoEntry, CtxConfig } from '../../core/config.js';
import { parseRepoManifest } from '../../core/manifest.js';
import { detectMonoRepo } from '../../utils/monorepo.js';
import { buildMultiRepoEntries } from './init.js';
import { parseFrontmatter, replaceFrontmatter } from '../../utils/frontmatter.js';
import { generateRepoTemplate } from '../../templates/repo.js';
import type { RepoTemplateData } from '../../templates/index-md.js';

export interface UpdateResult {
  status: 'updated';
  repos_current: string[];
  repos_added: string[];
  repos_removed: string[];
  frontmatter_updated: string[];
  table_updated: boolean;
  warnings?: string[];
}

export interface UpdateOptions {
  dryRun?: boolean;
}

export async function runUpdate(
  workspaceRoot: string,
  opts: UpdateOptions = {},
): Promise<UpdateResult> {
  const { dryRun = false } = opts;
  const configPath = join(workspaceRoot, 'ctx.yaml');

  if (!existsSync(configPath)) {
    throw new Error('ctx.yaml not found. Run ctxify init first.');
  }

  const config = loadConfig(configPath);
  const outputDir = config.options.outputDir || '.ctxify';
  const outputRoot = join(workspaceRoot, outputDir);

  // Re-detect repos based on existing mode
  const freshRepos = detectRepos(workspaceRoot, config);

  // Parse manifests for fresh repos
  const freshManifests = new Map<string, RepoTemplateData>();
  for (const repo of freshRepos) {
    const repoAbsPath = resolve(workspaceRoot, repo.path);
    const manifest = parseRepoManifest(repoAbsPath);
    freshManifests.set(repo.name, { name: repo.name, path: repo.path, ...manifest });
  }

  // Classify repos
  const oldNames = new Set(config.repos.map((r) => r.name));
  const newNames = new Set(freshRepos.map((r) => r.name));

  const repos_current = freshRepos.filter((r) => oldNames.has(r.name)).map((r) => r.name);
  const repos_added = freshRepos.filter((r) => !oldNames.has(r.name)).map((r) => r.name);
  const repos_removed = config.repos.filter((r) => !newNames.has(r.name)).map((r) => r.name);

  const warnings: string[] = [];
  const frontmatter_updated: string[] = [];
  let table_updated = false;

  if (dryRun) {
    // Still compute what would change for frontmatter
    for (const name of repos_current) {
      const overviewPath = join(outputRoot, 'repos', name, 'overview.md');
      if (existsSync(overviewPath)) {
        const manifest = freshManifests.get(name)!;
        const existing = parseFrontmatter(readFileSync(overviewPath, 'utf-8'));
        if (
          existing &&
          (existing.language !== (manifest.language || undefined) ||
            existing.framework !== (manifest.framework || undefined))
        ) {
          frontmatter_updated.push(`repos/${name}/overview.md`);
        }
      }
    }

    // Check index.md
    const indexPath = join(outputRoot, 'index.md');
    if (existsSync(indexPath)) {
      frontmatter_updated.push('index.md');
    }

    for (const name of repos_removed) {
      warnings.push(`Repo "${name}" no longer detected on disk. Context files preserved.`);
    }

    return {
      status: 'updated',
      repos_current,
      repos_added,
      repos_removed,
      frontmatter_updated,
      table_updated: repos_added.length > 0 || repos_current.length > 0,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  // --- Actual update ---

  // 1. Update ctx.yaml — merge fresh repos, preserve relationships/skills/options/user fields
  const mergedRepos = mergeRepos(config.repos, freshRepos, freshManifests);
  const updatedConfig: CtxConfig = {
    ...config,
    repos: mergedRepos,
  };
  writeFileSync(configPath, serializeConfig(updatedConfig), 'utf-8');

  // 2. Update index.md frontmatter
  const indexPath = join(outputRoot, 'index.md');
  if (existsSync(indexPath)) {
    let indexContent = readFileSync(indexPath, 'utf-8');
    const existingFm = parseFrontmatter(indexContent);
    if (existingFm) {
      const newFm = {
        ...existingFm,
        repos: mergedRepos.map((r) => r.name),
        scanned_at: new Date().toISOString(),
      };
      indexContent = replaceFrontmatter(indexContent, newFm);
    }

    // 3. Update index.md repo table
    const updatedTable = updateRepoTable(indexContent, freshManifests, repos_added);
    if (updatedTable !== indexContent) {
      table_updated = true;
      indexContent = updatedTable;
    }

    writeFileSync(indexPath, indexContent, 'utf-8');
    frontmatter_updated.push('index.md');
  }

  // 4. Update overview.md frontmatter per existing repo
  for (const name of repos_current) {
    const overviewPath = join(outputRoot, 'repos', name, 'overview.md');
    if (!existsSync(overviewPath)) continue;

    const manifest = freshManifests.get(name)!;
    const content = readFileSync(overviewPath, 'utf-8');
    const existing = parseFrontmatter(content);

    if (existing) {
      const newFm = {
        ...existing,
        language: manifest.language || undefined,
        framework: manifest.framework || undefined,
      };
      const updated = replaceFrontmatter(content, newFm);
      if (updated !== content) {
        writeFileSync(overviewPath, updated, 'utf-8');
        frontmatter_updated.push(`repos/${name}/overview.md`);
      }
    }
  }

  // 5. Scaffold new repos
  for (const name of repos_added) {
    const manifest = freshManifests.get(name)!;
    const repoDir = join(outputRoot, 'repos', name);
    mkdirSync(repoDir, { recursive: true });
    const overviewPath = join(repoDir, 'overview.md');
    if (!existsSync(overviewPath)) {
      writeFileSync(overviewPath, generateRepoTemplate(manifest), 'utf-8');
    }
  }

  // 6. Report removed repos
  for (const name of repos_removed) {
    warnings.push(`Repo "${name}" no longer detected on disk. Context files preserved.`);
  }

  return {
    status: 'updated',
    repos_current,
    repos_added,
    repos_removed,
    frontmatter_updated,
    table_updated,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function detectRepos(workspaceRoot: string, config: CtxConfig): RepoEntry[] {
  if (config.mode === 'mono-repo') {
    const monoDetection = detectMonoRepo(workspaceRoot);
    return monoDetection.packages.map((pkg) => ({
      path: pkg.relativePath,
      name: pkg.name,
      language: pkg.language,
      description: pkg.description,
    }));
  }

  if (config.mode === 'single-repo') {
    // Reuse existing repo entry — name was chosen during init, not from dirname
    const existing = config.repos.find((r) => r.path === '.');
    const name = existing?.name ?? basename(workspaceRoot);
    return [{ path: '.', name }];
  }

  // multi-repo
  return buildMultiRepoEntries(workspaceRoot);
}

function mergeRepos(
  existing: RepoEntry[],
  fresh: RepoEntry[],
  manifests: Map<string, RepoTemplateData>,
): RepoEntry[] {
  const existingByName = new Map(existing.map((r) => [r.name, r]));
  const merged: RepoEntry[] = [];

  for (const repo of fresh) {
    const manifest = manifests.get(repo.name);
    const old = existingByName.get(repo.name);

    merged.push({
      path: repo.path,
      name: repo.name,
      language: manifest?.language || undefined,
      framework: manifest?.framework || undefined,
      description: old?.description ?? repo.description,
      // Preserve user-configured include/exclude
      include: old?.include,
      exclude: old?.exclude,
    });
  }

  return merged;
}

export function updateRepoTable(
  content: string,
  manifests: Map<string, RepoTemplateData>,
  addedRepos: string[],
): string {
  const lines = content.split('\n');
  const headerIdx = lines.findIndex((l) =>
    /^\|\s*Repo\s*\|\s*Language\s*\|\s*Framework\s*\|\s*Role\s*\|/i.test(l),
  );
  if (headerIdx === -1) return content;

  // Header line + separator line
  const sepIdx = headerIdx + 1;
  if (sepIdx >= lines.length || !lines[sepIdx].startsWith('|')) return content;

  // Find all data rows
  let endIdx = sepIdx + 1;
  while (endIdx < lines.length && lines[endIdx].startsWith('|') && lines[endIdx].includes('|')) {
    // Check it's a data row, not another table
    const cells = lines[endIdx].split('|').filter((c) => c.trim() !== '');
    if (cells.length < 4) break;
    endIdx++;
  }

  // Parse and update existing rows
  const updatedRows: string[] = [];
  for (let i = sepIdx + 1; i < endIdx; i++) {
    const row = lines[i];
    const cells = row.split('|').slice(1, -1); // remove leading/trailing empty from split
    if (cells.length < 4) {
      updatedRows.push(row);
      continue;
    }

    // Extract repo name from link: [name](path)
    const repoCell = cells[0].trim();
    const nameMatch = repoCell.match(/\[([^\]]+)\]/);
    const repoName = nameMatch ? nameMatch[1] : repoCell;

    const manifest = manifests.get(repoName);
    if (manifest) {
      const lang = manifest.language || '--';
      const fw = manifest.framework || '--';
      const role = cells[3]; // preserve Role verbatim (keep original spacing)
      updatedRows.push(`| ${repoCell} | ${lang} | ${fw} |${role}|`);
    } else {
      updatedRows.push(row);
    }
  }

  // Append rows for added repos
  for (const name of addedRepos) {
    const manifest = manifests.get(name);
    if (!manifest) continue;
    // Only add if not already in the table
    const alreadyInTable = updatedRows.some((r) => r.includes(`[${name}]`));
    if (alreadyInTable) continue;

    const lang = manifest.language || '--';
    const fw = manifest.framework || '--';
    updatedRows.push(
      `| [${name}](repos/${name}/overview.md) | ${lang} | ${fw} | <!-- TODO: role --> |`,
    );
  }

  // Splice updated rows back
  const result = [...lines.slice(0, sepIdx + 1), ...updatedRows, ...lines.slice(endIdx)];

  return result.join('\n');
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update [dir]')
    .description('Re-detect repos and refresh mechanical data in context shards')
    .option('--dry-run', 'Show what would change without writing files')
    .action(async (dir?: string, options?: { dryRun?: boolean }) => {
      const workspaceRoot = resolve(dir || '.');

      let result: UpdateResult;
      try {
        result = await runUpdate(workspaceRoot, { dryRun: options?.dryRun });
      } catch (err) {
        console.log(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        process.exit(1);
        return;
      }

      console.log(JSON.stringify(result, null, 2));

      if (result.status === 'updated' && !options?.dryRun) {
        const lines = ['Context updated.'];
        if (result.repos_added.length > 0) {
          lines.push(`New repos: ${result.repos_added.join(', ')}`);
        }
        if (result.warnings && result.warnings.length > 0) {
          lines.push(`Warnings:\n${result.warnings.map((w) => `  - ${w}`).join('\n')}`);
        }
        console.error(lines.join('\n'));
      }
    });
}
