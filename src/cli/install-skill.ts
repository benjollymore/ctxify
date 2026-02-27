import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../utils/frontmatter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface AgentConfig {
  displayName: string;
  destDir: string;
  primaryFilename: string;
  // For agents that install each skill as a separate file (claude, cursor):
  skillFrontmatter?: (opts: { name: string; description: string; isPrimary: boolean }) => string;
  // For agents that combine all skills into one file (copilot, codex):
  singleFile?: boolean;
  combinedFrontmatter?: () => string;
  nextStepHint: string;
}

export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  claude: {
    displayName: 'Claude Code',
    destDir: '.claude/skills/ctxify',
    primaryFilename: 'SKILL.md',
    skillFrontmatter: ({ name, description }) =>
      `---\nname: ${name}\ndescription: ${description}\n---`,
    nextStepHint: 'open Claude Code and run /ctxify',
  },
  copilot: {
    displayName: 'GitHub Copilot',
    destDir: '.github/instructions',
    primaryFilename: 'ctxify.instructions.md',
    singleFile: true,
    combinedFrontmatter: () => '---\napplyTo: "**"\n---',
    nextStepHint: 'open VS Code with Copilot — instructions load automatically',
  },
  cursor: {
    displayName: 'Cursor',
    destDir: '.cursor/rules',
    primaryFilename: 'ctxify.md',
    skillFrontmatter: ({ description, isPrimary }) =>
      `---\ndescription: ${description}\nalwaysApply: ${isPrimary}\n---`,
    nextStepHint: 'open Cursor — rules load automatically',
  },
  codex: {
    displayName: 'OpenAI Codex',
    destDir: '.',
    primaryFilename: 'AGENTS.md',
    singleFile: true,
    combinedFrontmatter: () => '',
    nextStepHint: 'run Codex CLI — AGENTS.md loads automatically',
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

export function installSkill(workspaceRoot: string, agent: string): string {
  const config = AGENT_CONFIGS[agent];
  if (!config) {
    throw new Error(
      `Unsupported agent: ${agent}. Supported: ${Object.keys(AGENT_CONFIGS).join(', ')}`,
    );
  }

  const skillFiles = listSkillSourceFiles();
  const version = getVersion();
  const versionComment = `<!-- ctxify v${version} — do not edit manually, managed by ctxify init -->`;
  const destDir = join(workspaceRoot, config.destDir);
  mkdirSync(destDir, { recursive: true });

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
    writeFileSync(join(destDir, config.primaryFilename), content, 'utf-8');
  } else {
    // Install each skill as a separate file
    for (const { filename, sourcePath } of skillFiles) {
      const raw = readFileSync(sourcePath, 'utf-8');
      const fm = parseFrontmatter(raw);
      const name = String(fm?.name ?? 'ctxify');
      const description = String(fm?.description ?? '');
      const isPrimary = filename === 'SKILL.md';
      const agentFm = config.skillFrontmatter?.({ name, description, isPrimary }) ?? '';
      const body = stripFrontmatter(raw);
      const destFilename = isPrimary ? config.primaryFilename : filename;
      const installedContent = agentFm
        ? `${agentFm}\n${versionComment}\n${body}`
        : `${versionComment}\n${body}`;
      writeFileSync(join(destDir, destFilename), installedContent, 'utf-8');
    }
  }

  return join(config.destDir, config.primaryFilename);
}
