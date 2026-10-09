import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 2,
  use: { baseURL: 'http://localhost:3000' },
  webServer: { command: 'node scripts/next.mjs dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI },
});
