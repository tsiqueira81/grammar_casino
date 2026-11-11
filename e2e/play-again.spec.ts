import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, setUpMixedGame, sentence, card, clickButton } from './helpers';

/**
 * Package T1: "Play again" keeps the class and the settings and deals again in two clicks;
 * "New class" clears the players but the browser remembers the last setup.
 */
test('play again keeps the class, and a new class starts from the last setup', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await setUpMixedGame(page, { drop: ['Open cloze', 'Word formation', 'Key word'], hands: 1 });

  // A missing number of hands is named next to the button.
  const hands = page.locator('input[type="number"]:visible').first();
  await hands.fill('');
  await expect(page.getByTestId('setup-problem')).toHaveText('Type a number of hands (1 or more) to deal.');
  await hands.fill('1');
  await expect(page.getByTestId('setup-problem')).toHaveCount(0);

  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(sentence(page)).toContainText(/Lisbon|homework/);
  const isValid = (await sentence(page).innerText()).includes('Lisbon');
  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  await card(page, 'Ana').getByRole('button', { name: isValid ? /^Valid/ : /^Flawed/ }).click();
  await card(page, 'Ana').getByPlaceholder('Your bet').fill('300');
  await card(page, 'Bruno').getByRole('button', { name: isValid ? /^Flawed/ : /^Valid/ }).click();
  await card(page, 'Bruno').getByPlaceholder('Your bet').fill('300');
  await clickButton(page, /^Reveal the answer/);
  await clickButton(page, /See the final results/);

  // Play again: two clicks to the next first sentence, same players, money back to the start.
  await clickButton(page, /^Play again/);
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(sentence(page)).toContainText(/Lisbon|homework/);
  for (const name of ['Ana', 'Bruno']) {
    await expect(card(page, name)).toContainText('$1,000');
  }

  // A new class after a reload: no players, but the mixed formats and one hand are remembered.
  await page.evaluate(() => localStorage.removeItem('grammarCasinoGameState'));
  await page.reload();
  await addPlayers(page, ['Caio']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await expect(page.getByRole('checkbox', { name: 'Open cloze' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Multiple choice' })).toBeChecked();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await expect(page.locator('input[type="number"]:visible').first()).toHaveValue('1');

  expect(errors).toEqual([]);
});
