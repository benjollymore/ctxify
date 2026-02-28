---
repo: ctxify
type: domain
domain: skill-installation
---

# skill-installation

Installs 7 focused markdown skills to agent-specific paths during `ctxify init`. Skills teach agents the progressive disclosure workflow: orientation (SKILL.md), reading context, filling context, domain exploration, corrections, rules, multi-repo patterns. Multi-file agents (Claude, Cursor) install 7 separate files; single-file agents (Copilot, Codex) concatenate into one. Skills can be installed to workspace (default) or global home dir. Claude Code also installs SessionStart hook to reload context on every session.

## Concepts

**7 skills from skills/ directory**: SKILL.md (orientation), reading-context.md, filling-context.md, domain.md, corrections.md, rules.md, multi-repo.md. Embedded in package.json files field so npm includes them. **Agent types and destinations**: Claude → `.claude/skills/ctxify/` (7 files), Copilot → `.github/instructions/ctxify.instructions.md` (1 file), Cursor → `.cursor/rules/ctxify.md` (7 files), Codex → `AGENTS.md` (1 file). **Scope**: workspace (default) or global (~/.claude/skills/, ~/.cursor/rules/, etc.). Workspace scope keeps skills local to project; global scope shares across projects. **Version header**: each installed file includes comment header `<!-- ctxify v${version} -->` for tracking. **Hook installation**: Claude Code only. SessionStart hook in `.claude/settings.json` runs `ctxify context-hook` on every session start/resume/compact to auto-load corrections and rules. **Skill persistence**: installed paths + scopes recorded in ctx.yaml for `ctxify upgrade`.

## Decisions

**7 focused files not one monolithic file.** Each skill has a specific trigger and can be loaded on demand. Agents use trigger descriptions (built into skill frontmatter) to self-activate at the right moment. Monolithic file wastes context window. **Multi-file agents get separate files, single-file agents get concatenation.** Claude Code and Cursor support multiple instruction files per agent type; Copilot and Codex don't. Concatenation for single-file agents is simpler than trying to fake multiple files. **Skills installed during scaffold, persisted in ctx.yaml.** Init installs skills and records paths in config. `ctxify upgrade` reads config, reinstalls using recorded paths and scopes. Allows upgrade without re-running init. **SessionStart hook for Claude Code.** Hook runs at session start/resume/compact. Outputs corrections.md and rules.md content so past guidance is always available. Alternative: agents manually load context with `/ctxify`. Hook is opt-out via --no-hook.

## Patterns

**Skill reading and installation**: `installSkill()` reads all 7 files from skills/ directory (glob + readFileSync). For multi-file agents, installs each as separate file (Claude: `.claude/skills/ctxify/{name}.md`). For single-file agents, concatenates all files and installs as one. All files get version header prepended: `<!-- ctxify v${readPackageJson().version} -->`. Returns destination path. **Hook installation**: `installClaudeHook()` reads/updates `.claude/settings.json`, adds SessionStart hook command `ctxify context-hook --install_method <method>`. Hook path recorded for `ctxify clean` to remove. **Skill directory structure**: skills/ contains 7 files. Each is a standalone markdown file with YAML frontmatter (name, description, trigger description). Safe to read as-is and embed in agent config.

## Cross-repo

Skills are installed once at workspace root, not per-repo. Global scope (--global flag) installs to home directory so skills are available in every project. Workspace scope keeps skills local to the current project. Hook is workspace-wide, installed to `.claude/settings.json` at workspace root.
