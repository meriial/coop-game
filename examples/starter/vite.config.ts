import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@workshop/sdk': resolve(__dirname, '../../sdk/src/index.ts'),
    },
  },
});
