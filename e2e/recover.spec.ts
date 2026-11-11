import { test, expect } from '@playwright/test';
import { E2E_URL } from './helpers';

/** Package R8: a crashed screen shows a way out instead of a blank page. */
test('a crashed screen offers to recover, on the teacher screen and on a phone', async ({ page }) => {
  await page.goto(`${E2E_URL}&crash=1`);
  await expect(page.getByRole('alert')).toContainText('Something went wrong');
  await expect(page.getByRole('button', { name: 'Recover the game' })).toBeVisible();

  await page.goto(`${E2E_URL}&crash=1&room=ABCD`);
  await expect(page.getByRole('button', { name: 'Back to my seat' })).toBeVisible();

  // Without the test switch the game opens normally.
  await page.goto(E2E_URL);
  await expect(page.getByRole('button', { name: 'Open a live room' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
