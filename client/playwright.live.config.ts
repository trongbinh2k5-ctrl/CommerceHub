import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './visual-qa', workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, launchOptions: { executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }, screenshot: 'only-on-failure' },
});
