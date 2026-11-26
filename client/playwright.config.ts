import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, launchOptions: { executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev:demo --prefix ../server', url: 'http://127.0.0.1:5001/health', timeout: 120000, reuseExistingServer: false },
    { command: 'npm run preview', url: 'http://127.0.0.1:4173', timeout: 60000, env: { API_TARGET: 'http://127.0.0.1:5001' }, reuseExistingServer: false },
  ],
});
