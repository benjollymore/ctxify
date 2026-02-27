---
name: ctxify:filling-context
description: Use when documenting what you've learned about a codebase — filling ctxify context files after scaffolding.
---

# ctxify:filling-context — Filling Context

## Hard Gate

Do NOT catalog endpoints, schemas, types, env vars, or dependencies. You are writing the mental model a senior engineer carries — not an inventory.

## 4-Pass Workflow

### Pass 1: Fill overview.md TODOs (10 min per repo)

For each `repos/{name}/overview.md`:
- **Description** (1 paragraph): What this repo does, its role, who/what consumes it.
- **Architecture**: Annotate pre-filled key directories. Describe request/data flow (e.g., "Route → Validation → Controller → Service → Model"). Note DI approach, ORM, testing framework. 10-20 lines total.
- **Domain files**: Identify 3-5 domains to document. For each, invoke **ctxify:domain** — this scaffolds the file and registers it. Do NOT list domains without creating their files.
- **Anti-patterns**: Only if you spot a systemic issue that would cause real harm (data loss, silent error swallowing in a critical path, missing auth at an obvious boundary). Max 1-2 per repo. See STOP Rule 11 before logging anything.

### Pass 2: Scaffold and fill patterns.md (THE PRIMARY DELIVERABLE)

Run `ctxify patterns <repo>` to scaffold `repos/{name}/patterns.md` with TODO placeholders.

Read 3-5 key source files to understand patterns. Fill each TODO section:
- How routes/controllers are structured (3-5 line example)
- How validation works (2-3 line example)
- How tests are written (brief example)
- Naming conventions
- Gotchas and tips that save time

**High-entropy only:** Only document what would genuinely surprise someone or save them from disaster. If an agent can figure it out from 1-2 source files, use a `file:line` reference instead.

### Pass 3: Fill domain file TODOs

Domain files were scaffolded in Pass 1. Read entry points + 2-3 relevant source files per domain and fill:
- **Overview**: What this domain covers, key concepts, workflow/status flows
- **Key Files**: 5-10 most important files with 1-line descriptions (`file:line` references)
- **Patterns**: Domain-specific patterns with brief examples
- **Cross-repo**: How this domain spans repos (if applicable)

Keep each domain file 50-150 lines total.

### Pass 4: Fill index.md

- **Overview**: 2-3 sentences about the workspace
- **Relationships**: How repos connect (shared DB, API calls, auth). 5-10 lines.
- **Commands**: Essential commands per repo. 1-2 lines each.
- **Workflows**: 2-5 common cross-repo tasks as step-by-step guides. These are the highest-value context — tasks that trip up someone new.

## STOP Rules

These are hard constraints, not suggestions:

1. **Do NOT catalog endpoints.** Describe the routing pattern once. Agents read route files when they need specifics.
2. **Do NOT catalog models or schemas.** Describe the ORM pattern and name key models. Agents read model files.
3. **Do NOT catalog types or interfaces.** Describe the type system approach and mention key shared types by name only.
4. **Do NOT document env vars or infrastructure.** No setup guides, no docker commands, no deployment details.
5. **Do NOT document every dependency.** Agents can read package.json.
6. **Do NOT read more than entry points + 2-3 key files per domain.** Understand patterns, not every file.
7. **Maximum 150 lines per file.** Exceeded? Split into domain files or cut content. Shorter is better.
8. **If listing more than 10 of anything, STOP.** You're cataloging. Describe the pattern, give 2-3 examples.
9. **Do NOT inline patterns in overview.md.** Patterns belong in `patterns.md`. Overview is the hub, not the content.
10. **Do NOT list a domain in overview.md without creating it.** Use `ctxify domain add` for every domain you identify. `ctxify validate` will error if domain files are referenced but missing.
11. **Do NOT log anti-patterns liberally.** Apply the three-question bar (broad impact + learnable + real harm) strictly. Max 2 per repo. FIXME comments, style issues, and isolated oddities do not qualify.
