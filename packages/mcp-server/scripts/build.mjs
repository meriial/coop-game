#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  external: ['@modelcontextprotocol/sdk', 'zod'],
  sourcemap: true,
});

console.log('Built dist/index.js');
