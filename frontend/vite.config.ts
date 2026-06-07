import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
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
