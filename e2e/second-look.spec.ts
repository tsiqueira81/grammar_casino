import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, setUpMixedGame, sentence, card, clickButton } from './helpers';

/** Package L6: when most of the class misses a hand, its grammar point comes back two hands later. */
test('a missed grammar point comes back as a second look two hands later', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await setUpMixedGame(page, { drop: ['Multiple choice', 'Open cloze', 'Word formation', 'Key word'], hands: 3 });
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  const playHand = async (allWrong: boolean) => {
    await expect(sentence(page)).toContainText(/Lisbon|homework/);
    const isValid = (await sentence(page).innerText()).includes('Lisbon');
    const fullCards = page.getByRole('button', { name: 'Full cards' });
    if (await fullCards.isVisible()) await fullCards.click();
    for (const name of ['Ana', 'Bruno']) {
      const pick = isValid !== allWrong ? /^Valid/ : /^Flawed/;
      await card(page, name).getByRole('button', { name: pick }).click();
      await card(page, name).getByPlaceholder('Your bet').fill('50');
    }
    await clickButton(page, /^Reveal the answer/);
  };
  const badge = page.getByText(/^Hand \d of 3 ·/).first();

  // Hand 1: everybody misses.
  await expect(badge).not.toContainText('Second look');
  await playHand(true);
  // Hand 2: an ordinary hand.
  await clickButton(page, 'Deal the next hand');
  await expect(badge).toContainText('Hand 2 of 3');
  await expect(badge).not.toContainText('Second look');
  await playHand(false);
  // Hand 3: the point from hand 1 comes back.
  await clickButton(page, 'Deal the next hand');
  await expect(badge).toContainText('Hand 3 of 3');
  await expect(badge).toContainText('Second look');

  expect(errors).toEqual([]);
});
