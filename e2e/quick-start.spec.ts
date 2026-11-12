import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, setUpMixedGame, sentence } from './helpers';

/** Package T1: "Quick start" deals the first hand at once with the last game's settings. */
test('quick start deals at once with the last settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  // A first visit has no last game, so no Quick start.
  await addPlayers(page, ['Ana']);
  await expect(page.getByTestId('quick-start')).toHaveCount(0);
  await setUpMixedGame(page, { drop: ['Open cloze', 'Word formation', 'Key word'], hands: 3 });
  // Package G7: a length preset sets the timer too.
  await page.getByRole('button', { name: /^5 · Warm-up/ }).click();
  await expect(page.getByRole('group', { name: 'Turn timer' }).getByRole('button', { name: /^45 s/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Turn timer' }).getByRole('button', { name: /^Off/ }).click();
  await page.locator('input[type="number"]:visible').first().fill('3');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(sentence(page)).toBeVisible();

  // Next lesson: the page opens without the saved game.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('gc-test-cleared')) return;
    sessionStorage.setItem('gc-test-cleared', '1');
    localStorage.removeItem('grammarCasinoGameState');
  });
  await page.reload();
  await addPlayers(page, ['Bruno']);
  await expect(page.getByTestId('quick-start-summary')).toContainText('Mixed · 3 hands · $1,000 each');
  await page.getByTestId('quick-start').click();
  await expect(sentence(page)).toBeVisible();
  await expect(page.getByText(/Hand 1 of 3/).first()).toBeVisible();

  expect(errors).toEqual([]);
});
