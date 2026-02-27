import type { Command } from 'commander';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../../core/config.js';
import type { SkillEntry } from '../../core/config.js';
import { installSkill } from '../install-skill.js';
import { invalidateVersionCache } from '../../utils/version-check.js';

const PACKAGE_NAME = '@benjollymore/ctxify@latest';

export interface UpgradeResult {
  status: 'upgraded' | 'dry-run';
  install_method: 'global' | 'local' | 'npx';
  npm_command: string[] | null;
  npx_note?: string;
  skills_reinstalled: string[];
}

export interface UpgradeOptions {
  dryRun?: boolean;
  execFn?: (args: string[], opts?: { cwd?: string }) => void;
  homeDir?: string; // injectable for testing global reinstall
}

export async function runUpgrade(
  workspaceRoot: string,
  opts: UpgradeOptions = {},
): Promise<UpgradeResult> {
  const { dryRun = false, execFn, homeDir } = opts;

  // Load ctx.yaml if available to get install_method and skills
  const configPath = join(workspaceRoot, 'ctx.yaml');
  let install_method: 'global' | 'local' | 'npx' = 'global';
  let skillsMap: Record<string, SkillEntry> = {};

  if (existsSync(configPath)) {
    try {
      const config = loadConfig(configPath);
      if (config.install_method) {
        install_method = config.install_method;
      }
      if (config.skills) {
        skillsMap = config.skills;
      }
    } catch {
      // If config is malformed, proceed with defaults
    }
  }

  // Build the npm args based on install method
  let npmArgs: string[] | null;
  let npx_note: string | undefined;

  if (install_method === 'global') {
    npmArgs = ['install', '-g', PACKAGE_NAME];
  } else if (install_method === 'local') {
    npmArgs = ['install', PACKAGE_NAME];
  } else {
    // npx — skip npm install
    npmArgs = null;
    npx_note =
      'npx install detected — npm package not updated. Run: npx @benjollymore/ctxify@latest to use the latest version.';
  }

  if (dryRun) {
    return {
      status: 'dry-run',
      install_method,
      npm_command: npmArgs,
      ...(npx_note ? { npx_note } : {}),
      skills_reinstalled: Object.values(skillsMap).map((e) => e.path),
    };
  }

  // Execute npm install
  if (npmArgs !== null) {
    const execImpl =
      execFn ??
      ((args: string[], execOpts?: { cwd?: string }) => {
        execFileSync('npm', args, { stdio: 'inherit', ...(execOpts ?? {}) });
      });

    const execOpts = install_method === 'local' ? { cwd: workspaceRoot } : undefined;
    execImpl(npmArgs, execOpts);
  }

  // Reinstall skills
  const skills_reinstalled: string[] = [];
  for (const [agent, entry] of Object.entries(skillsMap)) {
    try {
      const dest = installSkill(workspaceRoot, agent, entry.scope, homeDir);
      skills_reinstalled.push(dest);
    } catch {
      // Non-fatal — if agent is unknown or skill install fails, continue
    }
  }

  // Invalidate version check cache so next command checks immediately
  invalidateVersionCache();

  return {
    status: 'upgraded',
    install_method,
    npm_command: npmArgs,
    ...(npx_note ? { npx_note } : {}),
    skills_reinstalled,
  };
}

export function registerUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('Upgrade ctxify to the latest version and reinstall skills')
    .option('-d, --dir <path>', 'Workspace directory', '.')
    .option('--dry-run', 'Show what would happen without executing')
    .action(async (options: { dir?: string; dryRun?: boolean }) => {
      const workspaceRoot = resolve(options.dir || '.');

      let result: UpgradeResult;
      try {
        result = await runUpgrade(workspaceRoot, { dryRun: options.dryRun });
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

      if (result.status === 'upgraded') {
        const lines = ['ctxify upgraded successfully.'];
        if (result.npx_note) lines.push(result.npx_note);
        if (result.skills_reinstalled.length > 0) {
          lines.push(`Skills reinstalled: ${result.skills_reinstalled.join(', ')}`);
        }
        console.error(lines.join('\n'));
      }
    });
}
