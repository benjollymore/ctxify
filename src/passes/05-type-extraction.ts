import { relative } from 'node:path';
import type { AnalysisPass } from './types.js';
import type { SharedType } from '../core/context.js';
import { findFiles, readFileIfExists } from '../utils/fs.js';
import { TYPE_EXPORT_PATTERNS } from '../utils/regex-patterns.js';

const TYPE_FILE_EXTENSIONS = ['.ts', '.tsx', '.d.ts'];

export const typeExtractionPass: AnalysisPass = {
  name: 'type-extraction',
  description: 'Find exported types/interfaces and cross-reference imports across repos',
  dependencies: ['repo-detection', 'manifest-parsing'],
  configKeys: [],

  async execute(ctx, logger) {
    // Phase 1: Extract all exported types per repo
    const exportedTypes = new Map<string, Map<string, { kind: SharedType['kind']; file: string }>>();

    for (const repo of ctx.repos) {
      if (repo.language !== 'typescript' && repo.language !== 'javascript') continue;

      const repoTypes = new Map<string, { kind: SharedType['kind']; file: string }>();
      const typeFiles = findFiles(
        repo.path,
        (name) => TYPE_FILE_EXTENSIONS.some((ext) => name.endsWith(ext)),
        { maxDepth: ctx.config.options.maxDepth, exclude: ctx.config.options.excludePatterns },
      );

      for (const file of typeFiles) {
        const content = readFileIfExists(file);
        if (!content) continue;

        const relFile = relative(repo.path, file);

        for (const [kind, pattern] of Object.entries(TYPE_EXPORT_PATTERNS.typescript)) {
          const regex = new RegExp(pattern.source, pattern.flags);
          let match: RegExpExecArray | null;
          match = regex.exec(content);
          while (match !== null) {
            const name = match[1];
            if (name) {
              repoTypes.set(name, { kind: kind as SharedType['kind'], file: relFile });
            }
            match = regex.exec(content);
          }
        }
      }

      exportedTypes.set(repo.name, repoTypes);
      logger.debug(`${repo.name}: found ${repoTypes.size} exported types`);
    }

    // Phase 2: Cross-reference imports to find shared types
    const typeUsage = new Map<string, Set<string>>();

    for (const repo of ctx.repos) {
      if (repo.language !== 'typescript' && repo.language !== 'javascript') continue;

      const codeFiles = findFiles(
        repo.path,
        (name) => ['.ts', '.tsx', '.js', '.jsx'].some((ext) => name.endsWith(ext)),
        { maxDepth: ctx.config.options.maxDepth, exclude: ctx.config.options.excludePatterns },
      );

      for (const file of codeFiles) {
        const content = readFileIfExists(file);
        if (!content) continue;

        for (const [otherRepoName, otherRepoTypes] of exportedTypes) {
          if (otherRepoName === repo.name) continue;

          for (const typeName of otherRepoTypes.keys()) {
            if (content.includes(typeName)) {
              if (!typeUsage.has(typeName)) {
                typeUsage.set(typeName, new Set());
              }
              typeUsage.get(typeName)!.add(repo.name);
            }
          }
        }
      }
    }

    // Phase 3: Build SharedType entries for types used across repos
    for (const [repoName, repoTypes] of exportedTypes) {
      for (const [typeName, typeInfo] of repoTypes) {
        const usedBy = typeUsage.get(typeName);
        if (usedBy && usedBy.size > 0) {
          ctx.sharedTypes.push({
            name: typeName,
            kind: typeInfo.kind,
            definedIn: repoName,
            file: typeInfo.file,
            usedBy: Array.from(usedBy),
          });
        }
      }
    }

    logger.info(`Found ${ctx.sharedTypes.length} shared types across repos`);
  },
};
