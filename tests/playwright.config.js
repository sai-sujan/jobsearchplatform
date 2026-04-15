// @ts-check
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  retries: 1,
  workers: 1, // Serial — tests share a single backend DB
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],

  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
