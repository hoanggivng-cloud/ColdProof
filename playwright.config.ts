import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', use: { baseURL: 'http://localhost:3000' },
  webServer: { command: 'pnpm --filter @coldproof/web dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI },
});
