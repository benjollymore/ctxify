import type { EvalTask } from './types.js';

export const EVAL_TASKS: EvalTask[] = [
  // ── Task 1: Add `ctxify stats` command ──────────────────────────────
  {
    id: 'add-stats-command',
    category: 'new-command',
    prompt: `Add a CLI command \`ctxify stats\` that reads ctx.yaml and reports per-repo statistics.

For each repo, report:
- Number of .md files in its repos/{name}/ directory
- Total character count across those files
- Whether patterns.md exists
- Whether corrections.md exists

Output JSON to stdout. On error, output \`{ "error": "..." }\` and exit with code 1.

Write the complete implementation file and show how it would be registered in the CLI entry point.`,
    sourceFiles: [
      'bin/ctxify.ts',
      'src/cli/commands/status.ts',
      'src/cli/commands/audit.ts',
      'src/core/config.ts',
    ],
    contextFiles: [
      '.ctxify/repos/ctxify/overview.md',
      '.ctxify/repos/ctxify/patterns.md',
    ],
    rubric: [
      {
        id: 'file-placement',
        description:
          'Handler is in src/cli/commands/stats.ts (not in bin/, not in core/, not in a random location)',
        weight: 1.5,
      },
      {
        id: 'registration-pattern',
        description:
          'Exports registerStatsCommand(program: Command), registered in bin/ctxify.ts via import + call',
        weight: 2.0,
      },
      {
        id: 'json-output',
        description:
          'All output via console.log(JSON.stringify(...)), errors use { error } + process.exit(1)',
        weight: 2.0,
      },
      {
        id: 'config-loading',
        description: 'Uses loadConfig() from src/core/config.ts to read ctx.yaml',
        weight: 1.5,
      },
      {
        id: 'type-imports',
        description:
          'Uses import type { Command } for type-only imports, ESM .js extensions on relative imports',
        weight: 1.0,
      },
      {
        id: 'correctness',
        description:
          'Logic correctly counts files, characters, checks existence of patterns.md and corrections.md',
        weight: 1.0,
      },
    ],
    expectedSignals: [
      { pattern: 'registerStatsCommand', description: 'Correct function naming convention' },
      { pattern: 'JSON.stringify', description: 'JSON output pattern' },
      { pattern: 'loadConfig', description: 'Uses config loading utility' },
      { pattern: "from '../../core/config.js'", description: 'ESM .js extension on import' },
      { pattern: 'import type', description: 'Type-only import syntax' },
      { pattern: 'process.exit(1)', description: 'Error exit pattern' },
    ],
    antiPatterns: [
      { pattern: 'console.error', description: 'Should use JSON error output, not console.error' },
      { pattern: 'require(', description: 'CJS require instead of ESM import' },
      { pattern: 'module.exports', description: 'CJS exports instead of ESM export' },
      { pattern: 'export default', description: 'Named exports preferred over default' },
    ],
  },

  // ── Task 2: Write tests for `clean` command ─────────────────────────
  {
    id: 'write-clean-tests',
    category: 'new-test',
    prompt: `Write unit tests for the \`clean\` command (src/cli/commands/clean.ts).

Cover these scenarios:
1. Both ctx.yaml and .ctxify/ directory exist — both get removed
2. Only ctx.yaml exists — removes it, reports .ctxify/ as not found
3. Neither file exists — reports both as not found
4. Custom outputDir in ctx.yaml — removes the custom directory instead of .ctxify/
5. JSON output shape — stdout is valid JSON with expected fields

Write the complete test file.`,
    sourceFiles: [
      'src/cli/commands/clean.ts',
      'test/unit/validate.test.ts',
      'test/unit/feedback.test.ts',
      'src/core/config.ts',
    ],
    contextFiles: [
      '.ctxify/repos/ctxify/overview.md',
      '.ctxify/repos/ctxify/patterns.md',
    ],
    rubric: [
      {
        id: 'temp-dir-isolation',
        description:
          'Creates temp dir with mkdtempSync in beforeEach, removes with rmSync({recursive:true}) in afterEach',
        weight: 2.5,
      },
      {
        id: 'vitest-imports',
        description: 'Imports describe/it/expect/beforeEach/afterEach from vitest, not jest or mocha',
        weight: 1.5,
      },
      {
        id: 'cli-binary-invocation',
        description:
          'Uses execFileSync to invoke built CLI binary, or imports and calls the handler directly',
        weight: 1.5,
      },
      {
        id: 'json-output-validation',
        description: 'Parses stdout with JSON.parse and asserts on structure/fields',
        weight: 1.5,
      },
      {
        id: 'coverage-completeness',
        description: 'Covers all 5 specified scenarios with distinct test cases',
        weight: 1.0,
      },
    ],
    expectedSignals: [
      { pattern: 'mkdtempSync', description: 'Temp directory creation' },
      { pattern: 'rmSync', description: 'Temp directory cleanup' },
      { pattern: 'beforeEach', description: 'Per-test setup' },
      { pattern: 'afterEach', description: 'Per-test teardown' },
      { pattern: 'JSON.parse', description: 'Parses JSON output' },
      { pattern: "from 'vitest'", description: 'Vitest imports' },
    ],
    antiPatterns: [
      { pattern: "from 'jest'", description: 'Jest instead of vitest' },
      { pattern: "require('", description: 'CJS require' },
      { pattern: 'jest.', description: 'Jest API usage' },
    ],
  },

  // ── Task 3: Fix validateShards double-read ──────────────────────────
  {
    id: 'fix-validation-double-read',
    category: 'bug-fix',
    prompt: `Refactor \`validateShards\` in src/core/validate.ts to eliminate the double file read.

Currently the function reads each .md file twice: once for segment marker checking and once for TODO checking.

Refactor so each file is read once into a Map<string, string> (path → content), then both checks reuse the cached content. The public API (function signature and return type) must not change. All existing validation checks must still run.

Show the complete refactored file.`,
    sourceFiles: [
      'src/core/validate.ts',
      'src/utils/frontmatter.ts',
      'test/unit/validate.test.ts',
    ],
    contextFiles: [
      '.ctxify/repos/ctxify/overview.md',
      '.ctxify/repos/ctxify/patterns.md',
      '.ctxify/repos/ctxify/corrections.md',
    ],
    rubric: [
      {
        id: 'correct-layer',
        description: 'Changes are in src/core/validate.ts, not in CLI commands or utils',
        weight: 2.0,
      },
      {
        id: 'api-preservation',
        description: 'Function signature and return type are unchanged',
        weight: 2.0,
      },
      {
        id: 'single-read',
        description:
          'File content is cached in a Map<string, string> and reused across checks, no duplicate readFileSync calls',
        weight: 1.5,
      },
      {
        id: 'all-checks-preserved',
        description:
          'All validation checks still run: frontmatter, segment markers, TODOs, domain-index, file references',
        weight: 1.5,
      },
      {
        id: 'code-quality',
        description: 'Clean types, no any casts, consistent style with rest of codebase',
        weight: 1.0,
      },
    ],
    expectedSignals: [
      { pattern: 'Map<string, string>', description: 'Content cache type' },
      { pattern: 'readFileSync', description: 'File reading (should appear fewer times)' },
      { pattern: 'validateShards', description: 'Function name preserved' },
    ],
    antiPatterns: [
      { pattern: ': any', description: 'Loose typing' },
      { pattern: 'as any', description: 'Unsafe cast' },
      { pattern: 'console.log', description: 'Debug logging in library code' },
    ],
  },

  // ── Task 4: Add Cargo.toml manifest parsing ─────────────────────────
  {
    id: 'add-cargo-toml-support',
    category: 'new-feature',
    prompt: `Add Rust manifest parsing to the manifest fallback chain in src/core/manifest.ts.

Requirements:
- Add Cargo.toml parsing after requirements.txt in the fallback chain
- Detect frameworks: actix-web, rocket, axum, warp (from [dependencies] section)
- Find entry points: check for src/main.rs and src/lib.rs
- Language should be "rust"
- Write tests covering: basic Cargo.toml, each framework, entry point discovery, empty deps

Show the changes to manifest.ts and the new test cases.`,
    sourceFiles: [
      'src/core/manifest.ts',
      'src/utils/fs.ts',
      'test/unit/manifest.test.ts',
    ],
    contextFiles: [
      '.ctxify/repos/ctxify/overview.md',
      '.ctxify/repos/ctxify/patterns.md',
      '.ctxify/repos/ctxify/manifest-detection.md',
    ],
    rubric: [
      {
        id: 'fallback-chain-position',
        description:
          'Cargo.toml is checked after requirements.txt and before the empty defaults fallback',
        weight: 2.5,
      },
      {
        id: 'framework-detection-pattern',
        description:
          'Dedicated detectRustFramework function using string/regex matching on dependency names',
        weight: 2.0,
      },
      {
        id: 'entry-point-discovery',
        description: 'Checks for src/main.rs and src/lib.rs existence using isFile() or similar',
        weight: 1.5,
      },
      {
        id: 'test-isolation',
        description:
          'Tests use temp dirs, vitest, create per-test Cargo.toml fixtures, clean up after',
        weight: 1.5,
      },
      {
        id: 'return-shape',
        description:
          'Returns complete ManifestData with language, framework, deps, entryPoints fields',
        weight: 1.0,
      },
    ],
    expectedSignals: [
      { pattern: 'Cargo.toml', description: 'Manifest file name' },
      { pattern: 'rust', description: 'Language identifier' },
      { pattern: 'actix', description: 'Framework detection' },
      { pattern: 'src/main.rs', description: 'Rust entry point' },
    ],
    antiPatterns: [
      { pattern: 'require(', description: 'CJS require' },
      { pattern: 'JSON.parse', description: 'TOML is not JSON — should use string parsing' },
    ],
  },

  // ── Task 5: Add relationships.md template ───────────────────────────
  {
    id: 'add-relationships-template',
    category: 'new-feature',
    prompt: `Create a new template generator for relationships.md in src/templates/relationships.ts.

Requirements:
- Pure function: takes typed data, returns markdown string, no I/O
- YAML frontmatter using dumpYaml from ../utils/yaml.js
- Typed interface RelationshipsTemplateData with repos array and workspace name
- Generates a markdown table of repo relationships with TODO guidance
- Export the generator function from src/index.ts

Show the complete template file and the index.ts export addition.`,
    sourceFiles: [
      'src/templates/corrections.ts',
      'src/templates/domain.ts',
      'src/templates/patterns.ts',
      'src/index.ts',
      'src/core/config.ts',
    ],
    contextFiles: [
      '.ctxify/repos/ctxify/overview.md',
      '.ctxify/repos/ctxify/patterns.md',
    ],
    rubric: [
      {
        id: 'pure-function',
        description:
          'No I/O, no side effects, takes RelationshipsTemplateData → returns string',
        weight: 2.5,
      },
      {
        id: 'frontmatter-pattern',
        description: "Uses dumpYaml from '../utils/yaml.js' for YAML frontmatter block",
        weight: 2.0,
      },
      {
        id: 'typed-interface',
        description:
          'Defines RelationshipsTemplateData interface with PascalCase + Data suffix convention',
        weight: 1.5,
      },
      {
        id: 'index-export',
        description:
          "Added to src/index.ts exports with .js extension on the import path",
        weight: 1.5,
      },
      {
        id: 'todo-marker',
        description: 'Includes <!-- TODO: Agent ... --> guidance comment for agent filling',
        weight: 1.0,
      },
    ],
    expectedSignals: [
      { pattern: 'dumpYaml', description: 'YAML serialization utility' },
      { pattern: 'RelationshipsTemplateData', description: 'Typed interface' },
      { pattern: '<!-- TODO:', description: 'TODO marker for agents' },
      { pattern: "from '../utils/yaml.js'", description: 'ESM .js extension' },
      { pattern: 'export function generate', description: 'Named export generator' },
    ],
    antiPatterns: [
      { pattern: 'writeFileSync', description: 'I/O in template generator' },
      { pattern: 'readFileSync', description: 'I/O in template generator' },
      { pattern: 'export default', description: 'Default export instead of named' },
    ],
  },
];
