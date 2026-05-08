import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tmp',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5175',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
