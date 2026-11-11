import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, setUpMixedGame, sentence, card, expectResultBalance } from './helpers';

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

/** Package R8: Pause, Reveal now, Undo reveal and Correct the ruling (void) in a local game. */
test('the teacher can pause, reveal now, undo the reveal and void the hand', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno', 'Caio']);
  await setUpMixedGame(page, { drop: ['Open cloze', 'Word formation', 'Key word'], hands: 3 });
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  await expect(sentence(page)).toContainText(/Lisbon|homework/);
  const isValid = (await sentence(page).innerText()).includes('Lisbon');
  const right = isValid ? /^Valid/ : /^Flawed/;
  const wrong = isValid ? /^Flawed/ : /^Valid/;

  // Pause and resume.
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume the hand' }).click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);

  // Ana and Bruno bet; Caio does not, so only Reveal now can reveal.
  await page.getByRole('button', { name: 'Full cards' }).click();
  await card(page, 'Ana').getByRole('button', { name: right }).click();
  await card(page, 'Ana').getByPlaceholder('Your bet').fill('100');
  await card(page, 'Bruno').getByRole('button', { name: wrong }).click();
  await card(page, 'Bruno').getByPlaceholder('Your bet').fill('50');

  await page.getByRole('button', { name: 'Reveal now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reveal now' }).click();
  await expectResultBalance(page, 'Ana', 1100);
  await expectResultBalance(page, 'Bruno', 950);

  // Undo the reveal: back to the hand, bets kept.
  await page.getByRole('button', { name: /^Undo reveal/ }).click();
  await expect(sentence(page)).toContainText(/Lisbon|homework/);
  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  await expect(card(page, 'Ana').getByPlaceholder('Your bet')).toHaveValue('100');

  // Reveal again, then void the hand: every stake comes back.
  await page.getByRole('button', { name: 'Reveal now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reveal now' }).click();
  await expectResultBalance(page, 'Ana', 1100);
  await page.getByRole('button', { name: 'Correct the ruling' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Void the hand' }).click();
  await expectResultBalance(page, 'Ana', 1000);
  await expectResultBalance(page, 'Bruno', 1000);
  await expect(page.getByText('Hand voided: stake returned').first()).toBeVisible();

  expect(errors).toEqual([]);
});
