import { test, expect } from '@playwright/test';
import { E2E_URL } from './helpers';

/** Package A4: Shift+L shows the debug log; a crash offers "Copy details". */
test('the debug log opens with Shift+L and holds what happened', async ({ page }) => {
  await page.goto(E2E_URL);
  await expect(page.getByRole('button', { name: 'Open a live room' })).toBeVisible();
  await page.keyboard.press('Shift+L');
  const log = page.getByTestId('debug-log');
  await expect(log).toBeVisible();
  await expect(log).toContainText('Screen: PLAYER_SETUP');
  await expect(page.getByTestId('app-version')).not.toBeEmpty();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download the log' }).click();
  expect((await download).suggestedFilename()).toMatch(/^grammar-casino-log-.*\.txt$/);
  await page.keyboard.press('Escape');
  await expect(log).toHaveCount(0);

  await page.goto(`${E2E_URL}&crash=1`);
  await expect(page.getByTestId('crash-copy-details')).toBeVisible();
});

/** Package A5: the join screen says what is kept and links the notice. */
test('the phone join screen links the privacy notice', async ({ page }) => {
  await page.goto(`${E2E_URL}&room=ABCD`);
  await expect(page.getByTestId('join-privacy')).toContainText('No account, no email');
  const res = await page.request.get(new URL('/privacy.html', page.url()).toString());
  expect(res.ok()).toBe(true);
  expect(await res.text()).toContain('Privacy in Grammar Casino');
});
