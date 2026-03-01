---
repo: ctxify
type: domain
domain: agent-skills
---

# agent-skills

Agent skills are markdown files that ship context + playbooks to AI coding agents. ctxify installs skills to agent-specific paths (e.g., `.claude/skills/ctxify/`, `.github/instructions/`, `.cursor/rules/`) with agent-specific file structures and frontmatter. Claude Code and Cursor use multi-file (one skill per file, satellites in sibling directories). Copilot and Codex concatenate all skills into a single file. Each installed file includes a version comment header for idempotency.

## Concepts

**AgentConfig** defines agent-specific installation: displayName, destDir (relative to workspace root), primaryFilename (e.g., 'SKILL.md', 'ctxify.instructions.md'), skillFrontmatter fn (per-file frontmatter for multi-file agents), satelliteFilename (for Claude Code's sibling dirs), singleFile (concatenate all skills), combinedFrontmatter (global frontmatter for concatenated skills), nextStepHint (user guidance), globalDestDir (for global-scope install). **Skill scope:** 'workspace' (relative to workspace root) or 'global' (user's home dir). **SkillEntry:** persisted in ctx.yaml with path and scope. **Installation flow:** (1) Read all .md files from `skills/` dir, (2) Strip frontmatter from each, (3) For multi-file agents: write each skill as separate file with agent frontmatter, (4) For single-file: concatenate bodies with combined frontmatter, (5) Add version comment header for idempotency, (6) For Claude Code: create satellite dirs for non-primary skills.

## Decisions

**Separate skill files over monolithic playbook:** Rather than one giant playbook, each domain-specific workflow is a separate .md file (e.g., SKILL.md, domain.md, corrections.md). Agents load/invoke them independently, enabling focus and progressive disclosure. **Agent-specific install strategy:** Instead of shipping one format for all agents, each agent gets native file placement and structure (Claude Code needs dirs, Copilot needs .github/, Cursor uses .cursor/rules/). This respects each agent's constraints and conventions. **Frontmatter preservation but override:** Source skills have frontmatter (name, description) for metadata. Installation strips these and prepends agent-specific frontmatter (e.g., Claude Code's `name:` and `description:` fields). **Version comment idempotency:** Version comment in each installed file marks it as auto-generated, enabling re-runs of ctxify init to update skills without conflicts. **Satellite directory pattern for Claude Code:** Satellite skills get sibling directories (e.g., `.claude/skills/ctxify-domain/`) because Claude Code's skill discovery requires `dir/SKILL.md` structure; this keeps all skills within the ctxify namespace.

## Patterns

**Multi-file installation (Claude, Cursor):** For each skill file, parse its frontmatter → generate agent-specific frontmatter → strip original frontmatter → prepend agent frontmatter + version comment → write to file. For Claude Code satellites: write non-primary skills to sibling dirs (`.claude/skills/ctxify-{skillname}/SKILL.md`).

**Single-file installation (Copilot, Codex):** Concatenate all skill source files → strip frontmatter from each → join with `---` dividers → prepend combined frontmatter (if any) + version comment → write single file.

**Cleanup stale satellites:** After installation, scan parent dir for satellite directories matching the `{baseDir}-*` prefix pattern. Remove any whose skill name is no longer in skillFiles (handles deleted skills).

## Cross-repo

Skill installation is single-workspace: all agents in the workspace get their skills installed to workspace-local paths (destDir relative to workspace root) unless global scope is chosen. Global scope is only supported by Claude Code and Codex (those with globalDestDir defined), writing to the user's home dir. Skills themselves are independent of repo structure — the same SKILL.md is installed to every agent, regardless of how many repos exist in the workspace.
