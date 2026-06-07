import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Game plugins are file:-linked workspace packages that each import React.
    // Without dedupe, Vite resolves them to a separate React instance, which
    // breaks hooks ("Invalid hook call" / blank screen). Force a single copy.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@frontend': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5174,
    open: true,
  },
});
