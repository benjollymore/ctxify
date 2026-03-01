import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { parseFrontmatter } from '../utils/frontmatter.js';
import type { SkillScope } from '../core/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface AgentConfig {
  displayName: string;
  destDir: string;
  primaryFilename: string;
  // For agents that install each skill as a separate file (claude, cursor):
  skillFrontmatter?: (opts: {
    name: string;
    description: string;
    isPrimary: boolean;
    version: string;
  }) => string;
  // When set, each satellite skill gets its own sibling directory containing this filename.
  // Used by Claude Code, which requires one directory per skill with SKILL.md inside.
  satelliteFilename?: string;
  // For agents that combine all skills into one file (copilot, codex):
  singleFile?: boolean;
  combinedFrontmatter?: () => string;
  nextStepHint: string;
  // Path relative to $HOME for global scope installation (e.g. '.claude/skills/ctxify').
  // If undefined, global scope is not supported for this agent.
  globalDestDir?: string;
}

export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  claude: {
    displayName: 'Claude Code',
    destDir: '.claude/skills/ctxify',
    primaryFilename: 'SKILL.md',
    satelliteFilename: 'SKILL.md',
    skillFrontmatter: ({ name, description, version }) =>
      `---\nname: ${name}\ndescription: ${description}\nversion: "${version}"\n---`,
    nextStepHint: 'open Claude Code and run /ctxify or ask Claude to set up workspace context',
    globalDestDir: '.claude/skills/ctxify',
  },
  copilot: {
    displayName: 'GitHub Copilot',
    destDir: '.github/instructions',
    primaryFilename: 'ctxify.instructions.md',
    singleFile: true,
    combinedFrontmatter: () => '---\napplyTo: "**"\n---',
    nextStepHint: 'open VS Code with Copilot and ask it to set up workspace context',
  },
  cursor: {
    displayName: 'Cursor',
    destDir: '.cursor/rules',
    primaryFilename: 'ctxify.md',
    skillFrontmatter: ({ description, isPrimary, version }) =>
      `---\ndescription: ${description}\nalwaysApply: ${isPrimary}\nversion: "${version}"\n---`,
    nextStepHint: 'open Cursor and ask it to set up workspace context',
  },
  codex: {
    displayName: 'OpenAI Codex',
    destDir: '.',
    primaryFilename: 'AGENTS.md',
    singleFile: true,
    combinedFrontmatter: () => '',
    nextStepHint: 'run Codex CLI and ask it to set up workspace context',
    globalDestDir: '.codex',
  },
};

// ── Source file discovery ─────────────────────────────────────────────────

export function getSkillSourceDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      return join(dir, 'skills');
    }
    dir = dirname(dir);
  }
  throw new Error('Could not find ctxify package root');
}

export function listSkillSourceFiles(): Array<{ filename: string; sourcePath: string }> {
  const skillDir = getSkillSourceDir();
  const files = readdirSync(skillDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  // SKILL.md first, then the rest alphabetically
  const primary = files.filter((f) => f === 'SKILL.md');
  const satellites = files.filter((f) => f !== 'SKILL.md');

  return [...primary, ...satellites].map((filename) => ({
    filename,
    sourcePath: join(skillDir, filename),
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
}

function getVersion(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    try {
      const content = readFileSync(join(dir, 'package.json'), 'utf-8');
      return JSON.parse(content).version || '0.0.0';
    } catch {
      dir = dirname(dir);
    }
  }
  return '0.0.0';
}

// ── Backward-compat alias ─────────────────────────────────────────────────

export function getPrimarySkillSourcePath(): string {
  return join(getSkillSourceDir(), 'SKILL.md');
}

// Keep old name for any external callers
export function getPlaybookSourcePath(): string {
  return getPrimarySkillSourcePath();
}

// ── Install ───────────────────────────────────────────────────────────────

export function installSkill(
  workspaceRoot: string,
  agent: string,
  scope: SkillScope = 'workspace',
  homeDir?: string,
): string {
  const config = AGENT_CONFIGS[agent];
  if (!config) {
    throw new Error(
      `Unsupported agent: ${agent}. Supported: ${Object.keys(AGENT_CONFIGS).join(', ')}`,
    );
  }

  if (scope === 'global' && !config.globalDestDir) {
    throw new Error(`Agent "${agent}" does not support global scope installation.`);
  }

  const skillFiles = listSkillSourceFiles();
  const version = getVersion();
  const versionComment = `<!-- ctxify v${version} — do not edit manually, managed by ctxify init -->`;

  const resolvedHome = homeDir ?? homedir();
  const baseDir =
    scope === 'global'
      ? join(resolvedHome, config.globalDestDir!)
      : join(workspaceRoot, config.destDir);
  mkdirSync(baseDir, { recursive: true });

  if (config.singleFile) {
    // Concatenate all skills, strip frontmatter from each, prepend combined frontmatter
    const combinedFm = config.combinedFrontmatter?.() ?? '';
    const bodies = skillFiles.map(({ sourcePath }) => {
      const raw = readFileSync(sourcePath, 'utf-8');
      return stripFrontmatter(raw);
    });
    const content = combinedFm
      ? `${combinedFm}\n${versionComment}\n${bodies.join('\n\n---\n\n')}`
      : `${versionComment}\n${bodies.join('\n\n---\n\n')}`;
    writeFileSync(join(baseDir, config.primaryFilename), content, 'utf-8');
  } else {
    // Install each skill as a separate file
    for (const { filename, sourcePath } of skillFiles) {
      const raw = readFileSync(sourcePath, 'utf-8');
      const fm = parseFrontmatter(raw);
      const name = String(fm?.name ?? 'ctxify');
      const description = String(fm?.description ?? '');
      const isPrimary = filename === 'SKILL.md';
      const agentFm = config.skillFrontmatter?.({ name, description, isPrimary, version }) ?? '';
      const body = stripFrontmatter(raw);
      const installedContent = agentFm
        ? `${agentFm}\n${versionComment}\n${body}`
        : `${versionComment}\n${body}`;

      if (!isPrimary && config.satelliteFilename) {
        // Each satellite skill gets its own sibling directory so Claude Code
        // registers it as an independent invokable skill (requires dir/SKILL.md).
        const baseName = filename.replace(/\.md$/, '');
        const satelliteDir = join(dirname(baseDir), `${basename(baseDir)}-${baseName}`);
        mkdirSync(satelliteDir, { recursive: true });
        writeFileSync(join(satelliteDir, config.satelliteFilename), installedContent, 'utf-8');
      } else {
        const destFilename = isPrimary ? config.primaryFilename : filename;
        writeFileSync(join(baseDir, destFilename), installedContent, 'utf-8');
      }
    }

    // Clean up stale satellite directories (e.g. from deleted skills)
    if (config.satelliteFilename) {
      const parentDir = dirname(baseDir);
      const prefix = `${basename(baseDir)}-`;
      const expectedSatellites = new Set(
        skillFiles
          .filter(({ filename }) => filename !== 'SKILL.md')
          .map(({ filename }) => `${prefix}${filename.replace(/\.md$/, '')}`),
      );
      if (existsSync(parentDir)) {
        try {
          const siblings = readdirSync(parentDir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
            .map((d) => d.name);
          for (const dir of siblings) {
            if (!expectedSatellites.has(dir)) {
              rmSync(join(parentDir, dir), { recursive: true, force: true });
            }
          }
        } catch {
          // Best-effort cleanup — ignore errors
        }
      }
    }
  }

  if (scope === 'global') {
    return join('~', config.globalDestDir!, config.primaryFilename);
  }
  return join(config.destDir, config.primaryFilename);
}
