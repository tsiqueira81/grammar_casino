import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, card, clickButton } from './helpers';

/** Package L6: with "Level follows the class" on, three strong hands move the next hands one level up, with a notice. */
test('the level follows the class after three hands', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: /^Spot the error/ }).first().click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('switch', { name: 'Level follows the class' }).click();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  const fullCards = page.getByRole('button', { name: 'Full cards' });
  for (let hand = 1; hand <= 3; hand++) {
    await expect(page.getByTestId('spot-error-sentence')).toContainText('have finished');
    if (await fullCards.isVisible()) await fullCards.click();
    await card(page, 'Ana').getByRole('button', { name: /(^|\W)have finished$/ }).first().click();
    await card(page, 'Ana').getByPlaceholder('Your bet').fill('10');
    await clickButton(page, /^Reveal the answer/);
    if (hand < 3) {
      await expect(page.getByTestId('level-notice')).toHaveCount(0);
      await clickButton(page, 'Deal the next hand');
    }
  }
  await expect(page.getByTestId('level-notice')).toHaveText('The class got 100% right in the last 3 hands, so the next hands are B2 (one level up).');
  expect(errors).toEqual([]);
});
