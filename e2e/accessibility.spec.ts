import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E_URL, addPlayers, setUpMixedGame } from './helpers';

/**
 * Package S8: an automatic accessibility scan (axe-core) of the main teacher screens and the
 * phone join screen. Serious and critical problems fail the test.
 */
async function seriousProblems(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return results.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
}

test('the lobby, a hand and the results have no serious accessibility problems', async ({ page }) => {
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  expect(await seriousProblems(page), 'lobby').toEqual([]);

  await setUpMixedGame(page, { drop: ['Open cloze', 'Word formation', 'Key word'], hands: 1 });
  expect(await seriousProblems(page), 'house rules').toEqual([]);

  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(page.locator('p.font-sentence').first()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await seriousProblems(page), 'hand').toEqual([]);
});

test('the phone join screen has no serious accessibility problems', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  await phone.goto(`${E2E_URL}&room=ABCD`);
  await expect(phone.getByRole('textbox', { name: 'Your name' })).toBeVisible();
  await phone.waitForTimeout(800);
  expect(await seriousProblems(phone), 'join').toEqual([]);
  await context.close();
});
