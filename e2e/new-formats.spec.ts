import { test, expect } from '@playwright/test';
import { E2E_URL, addPlayers, card, clickButton, expectResultBalance } from './helpers';

/**
 * Package L8: the two newer question types. Spot the error is played like multiple choice on the
 * teacher's screen; Word order is played with word tiles, on a player card and on a phone.
 */
async function startSingleFormatGame(page: import('@playwright/test').Page, format: RegExp) {
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: format }).first().click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
}

test('Spot the error: the sentence comes in four parts and the part with the mistake wins', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await startSingleFormatGame(page, /^Spot the error/);

  await expect(page.getByTestId('format-task')).toHaveText('Which part has the mistake? A, B, C or D.');
  await expect(page.getByTestId('spot-error-sentence')).toContainText('have finished');

  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  await card(page, 'Ana').getByRole('button', { name: /(^|\W)have finished$/ }).first().click();
  await card(page, 'Ana').getByPlaceholder('Your bet').fill('100');
  await card(page, 'Bruno').getByRole('button', { name: /(^|\W)his homework$/ }).first().click();
  await card(page, 'Bruno').getByPlaceholder('Your bet').fill('50');
  await clickButton(page, /^Reveal the answer/);

  await expectResultBalance(page, 'Ana', 1100);
  await expectResultBalance(page, 'Bruno', 950);
  await expect(page.getByText('He has finished his homework already.').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Word order: tiles build the answer on a player card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await startSingleFormatGame(page, /^Word order/);

  await expect(page.getByTestId('format-task')).toHaveText('Put the words in order to make a sentence.');
  await expect(page.getByTestId('word-tiles').first()).toContainText('homework');

  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  const ana = card(page, 'Ana');
  const picker = ana.getByTestId('word-tile-picker');
  for (const w of ['she', 'has', 'already', 'finished', 'her', 'homework']) {
    await picker.getByRole('button', { name: w, exact: true }).click();
  }
  await expect(picker).toContainText('All the words are placed.');
  await expect(ana.getByRole('textbox').first()).toHaveValue('she has already finished her homework');
  await ana.getByPlaceholder('Your bet').fill('100');

  // Bruno types a wrong order and takes back a word on the way.
  const bruno = card(page, 'Bruno');
  const bPicker = bruno.getByTestId('word-tile-picker');
  for (const w of ['she', 'already', 'homework']) await bPicker.getByRole('button', { name: w, exact: true }).click();
  await bPicker.getByRole('button', { name: 'Take back the last word' }).click();
  for (const w of ['has', 'finished', 'her', 'homework']) await bPicker.getByRole('button', { name: w, exact: true }).click();
  await expect(bruno.getByRole('textbox').first()).toHaveValue('she already has finished her homework');
  await bruno.getByPlaceholder('Your bet').fill('50');

  await clickButton(page, /^Reveal the answer/);
  await expectResultBalance(page, 'Ana', 1100);
  await expectResultBalance(page, 'Bruno', 950);
  await expect(page.getByText('She has already finished her homework.').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Word order on a phone: the student taps the tiles and locks in', async ({ page: host, browser }) => {
  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  await phone.goto(`${E2E_URL}&room=${code}`);
  await phone.getByRole('textbox', { name: 'Your name' }).fill('Dani');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: "You're in, Dani!" })).toBeVisible();
  await host.getByRole('button', { name: 'Back to the table' }).click();
  await startSingleFormatGame(host, /^Word order/);

  await expect(phone.getByTestId('phone-format-task')).toHaveText('Put the words in order to make a sentence.');
  const picker = phone.getByTestId('word-tile-picker');
  for (const w of ['she', 'has', 'already', 'finished', 'her', 'homework']) {
    await picker.getByRole('button', { name: w, exact: true }).click();
  }
  await phone.getByRole('textbox', { name: 'Your bet in dollars' }).fill('100');
  await clickButton(phone, /^Lock in \$100 on she has already finished her homework/);
  await clickButton(host, /^Reveal the answer/);
  await expect(phone.getByRole('status').filter({ hasText: '$' }).first()).toHaveText('+$100');
});
