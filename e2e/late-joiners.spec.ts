import { test, expect, type Browser } from '@playwright/test';
import { E2E_URL } from './helpers';

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

async function openPhone(browser: Browser, code: string) {
  const context = await browser.newContext(PHONE);
  const phone = await context.newPage();
  await phone.goto(`${E2E_URL}&room=${code}`);
  return phone;
}

/** Package R6: with late joiners off, the room locks itself at the first hand; seated phones still come back. */
test('late joiners off locks the room when the first hand is dealt', async ({ page: host, browser }) => {
  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const code = ((await host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ }).first().textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code).toBeTruthy();

  const dani = await openPhone(browser, code!);
  await dani.getByRole('textbox', { name: 'Your name' }).fill('Dani');
  await dani.getByRole('button', { name: 'Join the table' }).click();
  await expect(dani.getByRole('heading', { name: "You're in, Dani!" })).toBeVisible();

  const lobby = host.getByRole('dialog', { name: 'Live room' });
  await lobby.getByRole('switch', { name: 'Late joiners: allowed' }).click();
  await expect(lobby.getByRole('switch', { name: 'Late joiners: not allowed' })).toHaveAttribute('aria-checked', 'false');
  // Not locked yet: the game has not started.
  await expect(lobby.getByRole('switch', { name: 'Room open' })).toBeVisible();

  await host.getByRole('button', { name: 'Back to the table' }).click();
  await host.getByRole('button', { name: 'Set up the game' }).click();
  await host.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await host.getByRole('button', { name: 'Next: house rules' }).click();
  await host.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(dani.getByRole('region', { name: 'The sentence' })).toContainText('more time');

  // A new phone is turned away; Dani's phone reloads and keeps its seat.
  const late = await openPhone(browser, code!);
  await late.getByRole('textbox', { name: 'Your name' }).fill('Eva');
  await late.getByRole('button', { name: 'Join the table' }).click();
  await expect(late.getByText(/locked by the teacher/)).toBeVisible();
  await dani.reload();
  await expect(dani.getByRole('region', { name: 'The sentence' })).toContainText('more time');
});
