import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, setUpMixedGame, sentence, card, clickButton } from './helpers';

/** Package T5: an unfinished game opened later offers to resume; finished games keep their report. */
test('an unfinished game offers to resume, and a finished game keeps its report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await setUpMixedGame(page, { drop: ['Open cloze', 'Word formation', 'Key word'], hands: 1 });
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(sentence(page)).toContainText(/Lisbon|homework/);
  const before = await sentence(page).innerText();

  // The teacher comes back two hours later (just after midnight that is yesterday, so the day shows too). The save is aged as the page opens again, because
  // the game also saves while the page closes (package F6: saves wait for a quiet second).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('gc-test-aged')) return;
    sessionStorage.setItem('gc-test-aged', '1');
    const raw = localStorage.getItem('grammarCasinoGameState');
    if (!raw) throw new Error('no saved game');
    const save = JSON.parse(raw);
    save.savedAt = Date.now() - 2 * 60 * 60 * 1000;
    localStorage.setItem('grammarCasinoGameState', JSON.stringify(save));
  });
  await page.reload();
  const welcome = page.getByRole('dialog', { name: 'Welcome back' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: /^Resume the game from (\w+ \d+ \w+, )?\d\d:\d\d \(hand 1 of 1\)$/ }).click();
  await expect(welcome).toHaveCount(0);
  await expect(sentence(page)).toHaveText(before);

  // A reload a moment later just carries on.
  await page.reload();
  await expect(sentence(page)).toHaveText(before);
  await expect(page.getByRole('dialog', { name: 'Welcome back' })).toHaveCount(0);

  // Finish the one-hand game, then find its report under Past reports.
  const isValid = before.includes('Lisbon');
  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  for (const name of ['Ana', 'Bruno']) {
    await card(page, name).getByRole('button', { name: isValid ? /^Valid/ : /^Flawed/ }).click();
    await card(page, name).getByPlaceholder('Your bet').fill('100');
  }
  await clickButton(page, /^Reveal the answer/);
  await clickButton(page, /See the final results/);
  await clickButton(page, /^New class/);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Past reports \(1\)/ }).click();
  await page.getByRole('dialog', { name: 'Past reports' }).getByRole('button', { name: /2 players · 1 hand/ }).click();
  await expect(page.getByRole('dialog', { name: 'Report card' })).toBeVisible();

  expect(errors).toEqual([]);
});
