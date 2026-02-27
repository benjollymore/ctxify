import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'es2022',
    platform: 'node',
    dts: true,
    splitting: false,
    clean: true,
    sourcemap: false,
    banner: {
      js: `import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);`,
    },
  },
  {
    entry: { 'bin/ctxify': 'bin/ctxify.ts' },
    format: ['esm'],
    target: 'es2022',
    platform: 'node',
    splitting: false,
    sourcemap: false,
    banner: {
      js: `#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);`,
    },
  },
]);
