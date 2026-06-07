import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          JWT_SECRET: 'test-jwt-secret',
          ADMIN_EMAIL: 'admin@test.com',
          ALLOWED_EMAIL_DOMAINS: 'example.test',
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    isolate: false,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
