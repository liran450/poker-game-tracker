import { expect, test, type Page } from '@playwright/test';

/**
 * The whole product, start to finish, in one browser session
 * (docs/build/PLAN.md#step-9): create → 4 players → buy-ins → shared cost →
 * settle everyone → end → the settlement screen's transfers → finish →
 * share text on the summary screen. This is the one flow every other test
 * only ever exercises in slices. Run twice — online, and with the network
 * disabled after the first load — matching step 7's precedent that "offline"
 * is verified with the network actually off, not just assumed from the
 * architecture.
 */

async function slideToConfirm(page: Page): Promise<void> {
  const slider = page.getByRole('slider');
  await expect(slider).toBeVisible();
  // The enclosing BottomSheet slides in over 260ms (tokens.css's
  // --animate-sheet-in). A bounding box taken mid-animation is stale by the
  // time the drag actually lands, so the pointerdown/move never reach the
  // thumb — wait for it to settle before measuring.
  await page.waitForTimeout(400);

  const box = await slider.boundingBox();
  if (!box) throw new Error('slider not found');

  // RTL: unconfirmed sits near the track's right edge; dragging left raises
  // progress. The track is the thumb's immediate DOM parent — not just any
  // ancestor with an aria-label, which the enclosing BottomSheet also has.
  const track = slider.locator('..');
  const trackBox = await track.boundingBox();
  if (!trackBox) throw new Error('track not found');

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = trackBox.x + 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move((startX + endX) / 2, startY, { steps: 5 });
  await page.mouse.move(endX, startY, { steps: 5 });
  await page.mouse.up();
}

async function playFullGame(page: Page): Promise<void> {
  // ---- Create the game ----
  await page.getByRole('button', { name: '+ משחק חדש' }).click();
  await expect(page.getByRole('heading', { name: 'משחק חדש' })).toBeVisible();

  await page.getByText('שחקנים', { exact: true }).click();
  for (const name of ['מור', 'אורי', 'רני', 'דנה']) {
    await page.getByPlaceholder('שם חדש…').fill(name);
    await page.getByPlaceholder('שם חדש…').press('Enter');
  }
  await page.getByRole('button', { name: /הוסף 4 שחקנים/ }).click();

  await page.getByRole('button', { name: 'התחל משחק' }).click();
  await expect(page).toHaveURL(/#\/game\//);

  await expect(page.locator('text=מור').first()).toBeVisible();

  // One buy-in each — chosen to match the settled chip counts below exactly,
  // so the pot safeguard stays balanced and the slide-to-confirm is reachable
  // without the discrepancy acknowledgement.
  const playerNames = ['מור', 'אורי', 'רני', 'דנה'];
  for (const name of playerNames) {
    const row = page
      .locator('div', { hasText: name })
      .filter({ has: page.getByRole('button', { name: `הוספת קנייה עבור ${name}` }) })
      .first();
    await row.getByRole('button', { name: `הוספת קנייה עבור ${name}` }).click();
  }

  // ---- A shared cost, split equally among everyone ----
  // Opening "הוצאות משותפות" with no shared costs yet goes straight to the
  // add form (no intermediate list screen to tap "+" on first).
  await page.getByRole('button', { name: 'אפשרויות משחק' }).click();
  await page.getByRole('button', { name: 'הוצאות משותפות' }).click();
  await page.getByPlaceholder('שם ההוצאה').fill('פיצה');
  await page.getByPlaceholder('סכום').fill('60');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'סגור' }).click();

  // ---- Settle every player ----
  const chipsByName: Record<string, string> = { מור: '20', אורי: '140', רני: '40', דנה: '200' };
  for (const [name, chips] of Object.entries(chipsByName)) {
    await page.getByRole('button', { name: `פעולות עבור ${name}` }).click();
    await page.getByRole('button', { name: 'סגירת שחקן' }).click();
    const chipsField = page.getByRole('textbox', { name: /כמה ז'יטונים נשארו ל/ });
    await chipsField.fill(chips);
    await page.getByRole('button', { name: 'סגור שחקן' }).click();
  }

  // ---- End the game ----
  await page.getByRole('button', { name: 'סיום משחק' }).click();
  await slideToConfirm(page);

  // ---- The settlement screen: fully reconciled transfers, then finish ----
  await expect(page.getByRole('button', { name: 'תוצאות' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'העברות' })).toBeVisible();
  await expect(page.getByText('הכל שויך ✓')).toBeVisible();
  await page.getByRole('button', { name: 'סיים' }).click();

  // ---- The summary screen ----
  await expect(page.getByRole('button', { name: 'שיתוף' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'העתק העברות' }).click();

  // A string expression, not a typed callback — this file's tsconfig has no
  // DOM lib (it's checked alongside vite.config.ts/eslint.config.js, which
  // run in Node), so `navigator` isn't a typed global here.
  const clipboard = await page.evaluate('navigator.clipboard.readText()');
  expect(clipboard).toContain('סיכום');
  expect(clipboard).toContain('העברות:');
  expect(clipboard).not.toMatch(/[*_#`]/); // plain text, no markdown
}

test('create → players → buy-ins → shared cost → settle → end → transfers → share text', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await playFullGame(page);
});

test('the same flow works with the network off after the first load', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await context.setOffline(true);
  await playFullGame(page);
});
