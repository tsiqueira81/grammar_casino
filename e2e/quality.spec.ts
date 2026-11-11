import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, sentence, card, clickButton } from './helpers';

/** Package V1: on a slow computer the 3D table ends on Low or Off, and the game goes on. */
test('with the CPU slowed 4 times, the table ends on Low or Off without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await expect(page.getByTestId('quality-choice')).toHaveValue('auto');
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(sentence(page)).not.toBeEmpty();
  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  for (const name of ['Ana', 'Bruno']) {
    await card(page, name).getByRole('button', { name: /^Valid|^[A-D] / }).first().click();
    await card(page, name).getByPlaceholder('Your bet').fill('300');
  }
  await clickButton(page, /^Reveal the answer/);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.quality3d), { timeout: 15_000 }).toMatch(/^(low|off)$/);
  expect(errors).toEqual([]);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

test('the teacher can turn the 3D table off', async ({ page }) => {
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByTestId('quality-choice').selectOption('off');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.quality3d)).toBe('off');
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('grammar_casino_quality_v1'))).toContain('"off"');
});
