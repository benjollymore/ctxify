
# ctxify — Agent Playbook

## 1. Detection

Check for `.ctxify/index.md` at workspace root.
- **Found** → Read it. Go to section 3.
- **Not found** → Check for `ctx.yaml`. If exists, run `ctxify init`. If neither, go to section 2.

## 2. First-time Setup

All repos must be subdirectories of the workspace root. Run ctxify from that root.

| Layout | Command |
|--------|---------|
| Single manifest at root only | `ctxify init` |
| Root manifest with `workspaces` field | `ctxify init --mono` |
| Multiple subdirs with manifests | `ctxify init --repos ./a ./b ./c` |

After init: fill context following the progressive disclosure workflow in section 4.

## 3. Reading Context — Progressive Disclosure

Context is layered. Load only what your current task requires:

1. **Always read:** `index.md` + each `repos/{name}/overview.md` + `repos/{name}/corrections.md` (if exists)
2. **When writing code in a repo:** read `repos/{name}/patterns.md` (how to build features)
3. **When working in a specific domain:** read `repos/{name}/{domain}.md` (deep dive)
4. **Only load what's relevant to the current task**

Overview files are table-of-contents. Detail files are the content.

## 4. Filling Context — Progressive Disclosure Workflow

You are writing the mental model a senior engineer carries in their head. Work in passes:

### Pass 1: Fill overview.md TODOs (quick — 10 min per repo)

For each `repos/{name}/overview.md`:
- **Description** (1 paragraph): What this repo does, its role, who/what consumes it.
- **Architecture**: Annotate pre-filled key directories. Describe the request/data flow (e.g., "Route → Validation → Controller → Service → Model"). Note DI approach, ORM, testing framework. 10-20 lines total.
- **Context TODO**: List the domains you'll document (e.g., `pickups.md` — pickup lifecycle and scheduling).

### Pass 2: Create patterns.md for each repo (THE PRIMARY DELIVERABLE)

Read 3-5 key source files to understand patterns. Create `repos/{name}/patterns.md` with frontmatter:

```yaml
---
repo: express
type: patterns
---
```

Content (20-50 lines total):
- How routes/controllers are structured (3-5 line example)
- How validation works (2-3 line example)
- How tests are written (brief example)
- Naming conventions
- Gotchas and tips that save time

**High-entropy only:** Only document what would genuinely surprise someone or save them from disaster. If an agent can figure it out by reading 1-2 source files, don't document it — point to the source file with `file:line` references instead.

**Reference over duplication:** Don't include code snippets that will become stale. Use `file:line` references pointing to authoritative source locations. Only use inline code for patterns repeated across many files where no single canonical source exists.

### Pass 3: Create domain files (one per complex area)

To scaffold a domain file quickly: `ctxify domain add <repo> <domain-name> --tags tag1,tag2`
This creates the file with TODO placeholders and updates overview.md's domain index.

Only for domains complex enough to warrant their own file. Read entry points + 2-3 domain files to understand workflows. Create `repos/{name}/{domain}.md` with frontmatter:

```yaml
---
repo: express
type: domain
domain: processed-fluids
tags: [dropoff, pickup, route-session]
---
```

Content (50-150 lines total):
- **Overview**: What this domain covers, key concepts, workflow/status flows
- **Key Files**: 5-10 most important files with 1-line descriptions (`file:line` references)
- **Patterns**: Domain-specific patterns with brief code examples
- **Cross-repo**: How this domain spans repos (e.g., backend model + frontend form)

### Pass 4: Fill index.md

- **Overview**: 2-3 sentences about the workspace
- **Relationships**: How repos connect (shared DB, API calls, auth). 5-10 lines.
- **Commands**: Essential commands per repo. 1-2 lines each.
- **Workflows**: 2-5 common cross-repo tasks as step-by-step guides. These are the highest-value context pieces — the tasks that trip up someone new to the codebase.

### 4a. STOP Rules — What NOT to Do

These rules are hard constraints, not suggestions:

1. **Do NOT catalog endpoints.** Describe the routing pattern once and move on. The agent can read route files when it needs specifics.

2. **Do NOT catalog models or schemas.** Describe the ORM pattern and name the key models. The agent can read model files directly.

3. **Do NOT catalog types or interfaces.** Describe the type system approach and mention key shared types by name. Do not document their fields.

4. **Do NOT document env vars or infrastructure.** No setup guides, no docker commands, no deployment details.

5. **Do NOT document every dependency.** The agent can read package.json.

6. **Do NOT read more than entry points + 2-3 key files per domain.** The goal is to understand patterns, not to read every file in the repo.

7. **Maximum 150 lines per file.** If a file exceeds this, split into domain files or cut content. Prefer shorter.

8. **If listing more than 10 of anything, STOP.** You're cataloging, not providing context. Describe the pattern and give 2-3 examples instead.

9. **Do NOT inline patterns in overview.md.** Patterns belong in `patterns.md`. Overview is the hub, not the content.

## 5. Updating

When code changes, update only the affected overview, patterns, or domain file. Do not regenerate everything. Run `ctxify validate` after updates.

When you encounter an undocumented domain during feature work, register it:
`ctxify domain add <repo> <domain-name> --description "what it covers"`
Fill the TODOs in the created file before moving on.

## 6. Multi-repo Git Workflow

In multi-repo workspaces, coordinate branches and commits across all repos:

**Create a matching branch in all repos:**
```
ctxify branch feat/add-notifications
```
Creates the branch in every repo listed in ctx.yaml. Output shows previous branch per repo.

**Commit changes across all repos:**
```
ctxify commit "feat: add notification support"
```
Stages and commits in every repo that has changes. Clean repos are skipped.

**When to use these:**
- Cross-repo features touching multiple repos in a single task
- Keeping branches aligned for a coherent PR set
- Multi-repo mode only (errors in single-repo and mono-repo)

**When NOT to use:**
- Single-repo work — use git directly
- When repos need different commit messages — commit individually

## 7. Corrections — Logging Mistakes

When existing context is wrong or you make a mistake future agents should avoid:

```
ctxify feedback <repo> --body "## Wrong assumption about auth middleware
..."
```

**When to file:**
- Context guidance led you astray
- A pattern contradicts documented patterns
- A cross-repo interaction works differently than described
- Significant time wasted due to missing/wrong context

**Format:** Include what happened, what's correct, and why. Use `file:line` refs.
corrections.md is loaded alongside overview.md before every task.

**Do NOT file for:** stale TODOs (fill them), typos (fix directly), new patterns (add to patterns.md).
