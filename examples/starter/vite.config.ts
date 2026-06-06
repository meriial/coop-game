import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@workshop/sdk': resolve(__dirname, '../../sdk/src/index.ts'),
    },
  },
  server: {
    // Bind on all interfaces so Dev Containers port forwarding reaches the host browser.
    host: true,
    port: 5173,
  },
});
