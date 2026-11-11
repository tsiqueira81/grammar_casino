import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, setUpMixedGame, sentence, card } from './helpers';

/** Package R8: the teacher swaps a sentence that does not work for the class; bets are cleared. */
test('the teacher can swap the sentence of the hand in play', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await setUpMixedGame(page, { drop: ['Open cloze', 'Word formation', 'Key word'], hands: 3 });
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  await expect(sentence(page)).toContainText(/\w+/);
  const before = await sentence(page).innerText();

  await page.getByRole('button', { name: 'Full cards' }).click();
  await card(page, 'Ana').getByPlaceholder('Your bet').fill('100');

  await page.getByRole('button', { name: 'Swap this sentence' }).click();
  await page.getByRole('button', { name: 'Swap the sentence' }).click();

  await expect(sentence(page)).not.toHaveText(before);
  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  await expect(card(page, 'Ana').getByPlaceholder('Your bet')).toHaveValue('');

  expect(errors).toEqual([]);
});
