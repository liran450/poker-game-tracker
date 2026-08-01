import { expect, test } from '@playwright/test';

/**
 * Step 16 (docs/build/PLAN.md): export a finished game, then delete it, entirely offline —
 * and separately, a game id this browser has never heard of resolves to the same friendly
 * dead end a purged game would (the remote fetch has nothing to reach in this sandbox either
 * way, docs/build/NOTES.md, so both cases are exercised by the one path here).
 */

test('a finished game can be exported (a real download) and then deleted, landing back on an empty home screen', async ({
  page,
}) => {
  await page.goto('./');

  await page.getByRole('button', { name: '+ משחק חדש' }).click();
  await page.getByText('שחקנים', { exact: true }).click();
  await page.getByPlaceholder('שם חדש…').fill('מור');
  await page.getByPlaceholder('שם חדש…').press('Enter');
  await page.getByRole('button', { name: 'הוסף שחקן' }).click();
  await page.getByRole('button', { name: 'התחל משחק' }).click();
  await expect(page).toHaveURL(/#\/game\//);

  await page
    .locator('div', { hasText: 'מור' })
    .filter({ has: page.getByRole('button', { name: 'הוספת קנייה עבור מור' }) })
    .first()
    .getByRole('button', { name: 'הוספת קנייה עבור מור' })
    .click();

  await page.getByRole('button', { name: 'פעולות עבור מור' }).click();
  await page.getByRole('button', { name: 'סגירת שחקן' }).click();
  await page.getByRole('textbox', { name: /כמה ז'יטונים נשארו ל/ }).fill('100');
  await page.getByRole('button', { name: 'סגור שחקן' }).click();

  await page.getByRole('button', { name: 'סיום משחק' }).click();
  const slider = page.getByRole('slider');
  await expect(slider).toBeVisible();
  await page.waitForTimeout(400);
  const box = await slider.boundingBox();
  if (!box) throw new Error('slider not found');
  const track = slider.locator('..');
  const trackBox = await track.boundingBox();
  if (!trackBox) throw new Error('track not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(trackBox.x + 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByRole('button', { name: 'סיים' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'סיים' }).click();

  // ---- The summary screen: export, a real browser download ----
  await expect(page.getByRole('button', { name: 'שיתוף' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'אפשרויות משחק' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ייצוא משחק' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^poker-game-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.json$/);
  const exportPath = await download.path();
  const exportedText = await (await import('node:fs/promises')).readFile(exportPath, 'utf-8');
  const exported = JSON.parse(exportedText) as { players: { displayName: string; net: number }[] };
  expect(exported.players.some((p) => p.displayName === 'מור')).toBe(true);

  // ---- Delete, with the exact spec-worded confirmation copy ----
  await page.getByRole('button', { name: 'אפשרויות משחק' }).click();
  await page.getByRole('button', { name: 'מחק משחק' }).click();
  await expect(page.getByText('הנתונים המפורטים יימחקו. הסטטיסטיקה תישמר.')).toBeVisible();
  await page.getByRole('button', { name: 'מחק משחק' }).click();

  await expect(page).toHaveURL(/#\/?$/);
  await expect(page.getByText('התחל משחק ראשון')).toBeVisible();
});

test('a game id this browser has no local record of shows a friendly dead end, not a blank screen', async ({
  page,
}) => {
  await page.goto('./#/game/00000000-0000-0000-0000-000000000000');

  await expect(page.getByText('המשחק לא נמצא')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('המשחק נמחק, פג תוקפו, או שאין לך הרשאה לצפות בו')).toBeVisible();

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.reload();
  await expect(page.getByText('המשחק לא נמצא')).toBeVisible({ timeout: 10_000 });
  expect(consoleErrors).toEqual([]);
});
