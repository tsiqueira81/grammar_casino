import { test, expect } from '@playwright/test';
import { E2E_URL, clickButton } from './helpers';

/**
 * Package T7: the first-run coach walks through four steps and offers a demo room. Twelve bots
 * join, bet and lock in on their own, the teacher reveals, and ending the demo brings back the
 * table that was there before (nothing from the demo is saved).
 */
test('the coach leads to a demo room where bots bet, and ending it leaves nothing behind', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(`${E2E_URL}&coach=1`);
  const coach = page.getByTestId('first-run-coach');
  await expect(coach).toBeVisible();
  for (const title of ['Open a room', 'Students join', 'Deal and reveal']) {
    await expect(coach.getByRole('heading', { name: title })).toBeVisible();
    await coach.getByRole('button', { name: 'Next' }).click();
  }
  await expect(coach.getByRole('heading', { name: 'Read the report' })).toBeVisible();
  const tableBefore = await page.locator('#lobby-table-title').textContent();
  await coach.getByRole('button', { name: 'Try a demo with bots' }).click();
  await expect(coach).toHaveCount(0);

  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(page.locator('#lobby-table-title')).toContainText('(12)', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  // Every bot locks in within a few seconds, so the reveal opens without the teacher's override.
  await expect(page.locator("body")).toContainText(/Locked in:\s*12\s*of\s*12/, { timeout: 20_000 });
  await clickButton(page, /^Reveal the answer/);
  await expect(page.getByText('Second conditional: if + past simple, would + base form.').first()).toBeVisible();

  await page.getByTestId('demo-banner').getByRole('button', { name: 'End demo' }).click();
  await expect(page.getByTestId('demo-banner')).toHaveCount(0);
  await expect(page.locator('#lobby-table-title')).toHaveText(tableBefore || '');
  expect(errors).toEqual([]);
});
