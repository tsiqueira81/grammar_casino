import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, sentence, card, clickButton } from './helpers';

/** Package L4: the teacher pastes sentences; they are dealt first, in order. */
test("the teacher's own sentences are dealt first", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await page.getByRole('button', { name: 'Set up the game' }).click();

  await page.getByRole('button', { name: 'Add sentences' }).click();
  await page.getByTestId('own-deck-text').fill('My cat sleeps on the sofa.\nMy dog sleep in the garden. -> My dog sleeps in the garden.\nA broken line _____ here.');
  await expect(page.getByTestId('own-deck-summary')).toHaveText('2 sentences: 1 correct, 1 with a mistake');
  await expect(page.getByTestId('own-deck-problems')).toContainText('Line 3 is left out');
  await page.getByRole('button', { name: 'Use 2 sentences' }).click();
  await expect(page.getByTestId('own-deck-status')).toContainText('My deck: 2 sentences');

  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: /Set number of hands/ }).click();
  await page.locator('input[type="number"]:visible').first().fill('3');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  await expect(sentence(page)).toContainText('My cat sleeps on the sofa.');
  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  for (const name of ['Ana', 'Bruno']) {
    await card(page, name).getByRole('button', { name: /^Valid/ }).click();
    await card(page, name).getByPlaceholder('Your bet').fill('50');
  }
  await clickButton(page, /^Reveal the answer/);
  await clickButton(page, 'Deal the next hand');
  await expect(sentence(page)).toContainText('My dog sleep in the garden.');
  expect(errors).toEqual([]);
});
