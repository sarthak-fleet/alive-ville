import { devices } from '@playwright/test';
import { definePlaywrightConfig } from '@saas-maker/test-config/playwright';

export default definePlaywrightConfig({
  testDir: './tmp',
  baseURL: 'http://localhost:5175',
  viewportMatrix: false,
  smoke: false,
  extend: {
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
  },
});
