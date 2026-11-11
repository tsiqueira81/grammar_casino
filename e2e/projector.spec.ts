import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, setUpMixedGame } from './helpers';

/**
 * Package V10: on a 1080p projector the hand is readable from the back of the room: body text
 * at least 28 px, the sentence at least 56 px, and nothing pushes the page sideways.
 */
test('projector mode at 1080p: 28 px body text, 56 px sentence, no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('grammar_casino_projector_mode', 'on'));
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno', 'Caio', 'Duda', 'Edu', 'Fabi']);
  await setUpMixedGame(page, { drop: ['Open cloze', 'Word formation', 'Key word'], hands: 2 });
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(page.locator('.font-sentence').first()).toBeVisible();

  const sizes = await page.evaluate(() => ({
    screen: document.documentElement.dataset.screen,
    body: [...document.querySelectorAll('.text-gc-body')].map((e) => parseFloat(getComputedStyle(e).fontSize)),
    sentence: parseFloat(getComputedStyle(document.querySelector('.font-sentence') as Element).fontSize),
    sideways: document.documentElement.scrollWidth > window.innerWidth,
  }));
  expect(sizes.screen).toBe('table');
  expect(sizes.body.length).toBeGreaterThan(0);
  expect(Math.min(...sizes.body)).toBeGreaterThanOrEqual(28);
  expect(sizes.sentence).toBeGreaterThanOrEqual(56);
  expect(sizes.sideways).toBe(false);
});
