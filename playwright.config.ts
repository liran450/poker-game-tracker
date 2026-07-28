import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Some sandboxes ship a Chromium whose build number doesn't match the one this
 * Playwright version expects, and downloading another is not an option there.
 * When that pre-installed binary is present, point at it; otherwise let
 * Playwright resolve its own, which is what CI and a normal checkout do.
 */
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined;

/**
 * The app is phone-first, so the default project is a phone. Desktop only has to
 * be not-broken (10-design-brief.md#what-not-to-design), so it is not a project.
 *
 * Chromium is pre-installed in this environment at PLAYWRIGHT_BROWSERS_PATH;
 * never run `playwright install`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/poker-game-tracker/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'android-chrome',
      use: {
        ...devices['Pixel 7'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173/poker-game-tracker/',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
