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
    sourcemap: true,
  },
  {
    entry: { 'bin/ctxify': 'bin/ctxify.ts' },
    format: ['esm'],
    target: 'es2022',
    platform: 'node',
    splitting: false,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
