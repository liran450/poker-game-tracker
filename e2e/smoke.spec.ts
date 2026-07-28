import { expect, test } from '@playwright/test';

test('the shell loads, in Hebrew, right-to-left', async ({ page }) => {
  await page.goto('./');

  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the production build ships a strict CSP and honours it', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });

  await page.goto('./');

  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  // The whole point: an injected script must have no way to execute.
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');

  expect(violations).toEqual([]);
});

test('the hash router serves an unknown route without a server round-trip', async ({ page }) => {
  await page.goto('./#/no-such-page');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(page.url()).toContain('#/no-such-page');
});
