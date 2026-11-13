import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, card, clickButton, sentence } from './helpers';

/**
 * Random theme: chosen on the setup screen, it gives every hand a different theme. The results
 * screen names the theme of the next hand, with a dice.
 */
test('Random theme deals a different theme each hand', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  const random = page.getByTestId('theme-random');
  await random.click();
  await expect(random).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('theme-random-note')).toBeVisible();
  // Choosing a theme switches Random off; choosing Random again switches it back on.
  await page.getByRole('button', { name: /^History/ }).click();
  await expect(random).toHaveAttribute('aria-pressed', 'false');
  await random.click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: /Set number of hands/ }).click();
  await page.locator('input[type="number"]:visible').first().fill('4');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  const nextThemes: string[] = [];
  for (let hand = 1; hand <= 3; hand++) {
    await expect(sentence(page)).toBeVisible();
    const fullCards = page.getByRole('button', { name: 'Full cards' });
    if (await fullCards.isVisible()) await fullCards.click();
    const c = card(page, 'Ana');
    const valid = c.getByRole('button', { name: /^Valid/ });
    if (await valid.count()) await valid.click();
    else await c.getByRole('button').filter({ hasText: /\w/ }).first().click();
    await c.getByPlaceholder('Your bet').fill('10');
    await clickButton(page, /^Reveal the answer/);
    const chip = page.getByTitle('Change the theme for the next hand');
    await expect(chip).toContainText('🎲');
    const text = (await chip.innerText()).trim();
    expect(text).not.toContain('Random');
    nextThemes.push(text);
    await clickButton(page, 'Deal the next hand');
  }
  // Hands 2, 3 and 4 each have their own theme.
  expect(new Set(nextThemes).size).toBe(3);
  expect(errors).toEqual([]);
});
