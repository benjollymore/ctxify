import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentConfig {
  displayName: string;
  destPath: string;
  frontmatter: () => string;
  nextStepHint: string;
}

export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  claude: {
    displayName: 'Claude Code',
    destPath: '.claude/skills/ctxify/SKILL.md',
    frontmatter: () =>
      '---\nname: ctxify\ndescription: Use when working in a workspace to get cross-repo context. Scaffolds CLAUDE.md-style context with ctxify init, then guides lean semantic analysis focused on architecture, patterns, and domains.\n---',
    nextStepHint: 'open Claude Code and run /ctxify',
  },
  copilot: {
    displayName: 'GitHub Copilot',
    destPath: '.github/instructions/ctxify.instructions.md',
    frontmatter: () => '---\napplyTo: "**"\n---',
    nextStepHint: 'open VS Code with Copilot — instructions load automatically',
  },
  cursor: {
    displayName: 'Cursor',
    destPath: '.cursor/rules/ctxify.md',
    frontmatter: () =>
      '---\ndescription: Cross-repo context layer — scaffolds and fills architecture, patterns, and domain knowledge for multi-repo workspaces.\nalwaysApply: true\n---',
    nextStepHint: 'open Cursor — rules load automatically',
  },
  codex: {
    displayName: 'OpenAI Codex',
    destPath: 'AGENTS.md',
    frontmatter: () => '',
    nextStepHint: 'run Codex CLI — AGENTS.md loads automatically',
  },
};

export function getPlaybookSourcePath(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      return join(dir, 'skills', 'PLAYBOOK.md');
    }
    dir = dirname(dir);
  }
  throw new Error('Could not find ctxify package root');
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

export function installSkill(workspaceRoot: string, agent: string): string {
  const config = AGENT_CONFIGS[agent];
  if (!config) {
    throw new Error(`Unsupported agent: ${agent}. Supported: ${Object.keys(AGENT_CONFIGS).join(', ')}`);
  }

  const playbookPath = getPlaybookSourcePath();
  const playbookBody = readFileSync(playbookPath, 'utf-8');
  const version = getVersion();
  const versionComment = `<!-- ctxify v${version} — do not edit manually, managed by ctxify init -->`;

  const frontmatter = config.frontmatter();
  let installedContent: string;

  if (frontmatter) {
    // Frontmatter + version comment after closing --- + playbook body
    installedContent = `${frontmatter}\n${versionComment}\n${playbookBody}`;
  } else {
    // No frontmatter — version comment + playbook body
    installedContent = `${versionComment}\n${playbookBody}`;
  }

  const destPath = join(workspaceRoot, config.destPath);
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, installedContent, 'utf-8');

  return config.destPath;
}
