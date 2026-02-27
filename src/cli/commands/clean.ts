import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { parseYaml } from '../../utils/yaml.js';

export function registerCleanCommand(program: Command): void {
  program
    .command('clean [dir]')
    .description('Remove .ctxify/ and ctx.yaml from workspace')
    .action((dir?: string) => {
      const workspaceRoot = resolve(dir || '.');
      const configPath = join(workspaceRoot, 'ctx.yaml');

      // Read outputDir from config before deleting anything
      let outputDirName = '.ctxify';
      if (existsSync(configPath)) {
        try {
          const raw = parseYaml<Record<string, unknown>>(readFileSync(configPath, 'utf-8'));
          const options = raw?.options as Record<string, unknown> | undefined;
          if (typeof options?.outputDir === 'string') {
            outputDirName = options.outputDir;
          }
        } catch {
          // Fall back to default if config is unparseable
        }
      }

      const outputDir = join(workspaceRoot, outputDirName);
      const removed: string[] = [];

      if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
        removed.push(outputDirName.endsWith('/') ? outputDirName : outputDirName + '/');
      }

      if (existsSync(configPath)) {
        rmSync(configPath);
        removed.push('ctx.yaml');
      }

      console.log(JSON.stringify({ removed, workspace: workspaceRoot }));
    });
}
