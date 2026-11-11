import { test, expect } from '@playwright/test';
import { KNOWN, E2E_URL, addPlayers, card, clickButton, expectResultBalance } from './helpers';

/** Package G6: with special hands on, the last hand is the Final Table and its wins pay double. */
test('the Final Table pays wins double and leaves losses as they are', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: /Set number of hands/ }).click();
  await page.locator('input[type="number"]:visible').first().fill('1');
  const special = page.getByRole('switch', { name: 'Special hands' });
  await expect(special).toHaveAttribute('aria-checked', 'false');
  await special.click();
  await expect(special).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  await expect(page.getByTestId('special-hand-card')).toContainText('Final Table');
  await expect(page.getByText(/Hand 1 of 1 · .* · Final Table 2×/).first()).toBeVisible();

  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  const bets = [
    { name: 'Ana', option: KNOWN.multipleChoiceAnswer, bet: 100 },
    { name: 'Bruno', option: KNOWN.multipleChoiceWrong, bet: 50 },
  ];
  for (const b of bets) {
    const c = card(page, b.name);
    await c.getByRole('button', { name: new RegExp(`(^|\\W)${b.option}$`) }).first().click();
    await c.getByPlaceholder('Your bet').fill(String(b.bet));
  }
  await clickButton(page, /^Reveal the answer/);
  await expectResultBalance(page, 'Ana', 1200);
  await expectResultBalance(page, 'Bruno', 950);
  await expect(page.getByText(/Final Table \(2×\)/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a phone in a live room shows the Final Table', async ({ page: host, browser }) => {
  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code).toBeTruthy();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  await phone.goto(`${E2E_URL}&room=${code}`);
  await phone.getByRole('textbox', { name: 'Your name' }).fill('Dani');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: "You're in, Dani!" })).toBeVisible();

  await host.getByRole('button', { name: 'Back to the table' }).click();
  await host.getByRole('button', { name: 'Set up the game' }).click();
  await host.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await host.getByRole('button', { name: 'Next: house rules' }).click();
  await host.getByRole('button', { name: /Set number of hands/ }).click();
  await host.locator('input[type="number"]:visible').first().fill('1');
  const special = host.getByRole('switch', { name: 'Special hands' });
  if ((await special.getAttribute('aria-checked')) !== 'true') await special.click();
  await host.getByRole('button', { name: 'Deal the first hand' }).click();

  await expect(phone.getByTestId('phone-special-hand')).toContainText('Final Table');
  await expect(phone.getByTestId('phone-special-hand')).toContainText('Every win pays double');
  await context.close();
});
