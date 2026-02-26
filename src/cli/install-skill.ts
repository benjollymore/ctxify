import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AGENT_SKILL_PATHS: Record<string, string> = {
  claude: '.claude/skills/ctxify/SKILL.md',
};

export function getSkillSourcePath(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      return join(dir, '.claude', 'skills', 'ctxify', 'SKILL.md');
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
  const relativePath = AGENT_SKILL_PATHS[agent];
  if (!relativePath) {
    throw new Error(`Unsupported agent: ${agent}. Supported: ${Object.keys(AGENT_SKILL_PATHS).join(', ')}`);
  }

  const sourcePath = getSkillSourcePath();
  const sourceContent = readFileSync(sourcePath, 'utf-8');
  const version = getVersion();

  // Insert version comment after the frontmatter closing '---' so it doesn't
  // break skill discovery (Claude Code requires '---' at line 1 to parse frontmatter)
  const versionComment = `<!-- ctxify v${version} — do not edit manually, managed by ctxify init -->`;
  const frontmatterEnd = sourceContent.indexOf('---', sourceContent.indexOf('---') + 3);
  let installedContent: string;
  if (frontmatterEnd !== -1) {
    const insertPos = frontmatterEnd + 3;
    installedContent = sourceContent.slice(0, insertPos) + '\n' + versionComment + sourceContent.slice(insertPos);
  } else {
    installedContent = `${sourceContent}\n${versionComment}`;
  }

  const destPath = join(workspaceRoot, relativePath);
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, installedContent, 'utf-8');

  return relativePath;
}
