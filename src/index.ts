// Config
export type {
  CtxConfig,
  RepoEntry,
  Relationship,
  ContextOptions,
  OperatingMode,
  MonoRepoOptions,
  SkillScope,
  SkillEntry,
} from './core/config.js';
export { loadConfig, generateDefaultConfig, serializeConfig } from './core/config.js';

// Manifest parsing
export type { ManifestData } from './core/manifest.js';
export { parseRepoManifest } from './core/manifest.js';

// Validation
export type { ValidationResult } from './core/validate.js';
export { validateShards } from './core/validate.js';

// Detection
export type { ModeDetectionResult } from './core/detect.js';
export { autoDetectMode } from './core/detect.js';

// Utilities
export { parseFrontmatter } from './utils/frontmatter.js';
export { extractSegments } from './utils/segments.js';
