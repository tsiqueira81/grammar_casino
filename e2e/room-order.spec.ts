import { test, expect, devices, type Browser } from '@playwright/test';
import { E2E_URL } from './helpers';

const PHONE = { ...devices['iPhone 13'], defaultBrowserType: undefined } as const;

async function openPhone(browser: Browser, code: string) {
  const context = await browser.newContext(PHONE);
  const phone = await context.newPage();
  await phone.goto(`${E2E_URL}&room=${code}`);
  return phone;
}

/** Package R6: a rude name is replaced, and a removed phone cannot take a seat again. */
test('the room replaces a rude name and keeps a removed phone out', async ({ page: host, browser }) => {
  const errors: string[] = [];
  host.on('pageerror', e => errors.push(`host: ${e.message}`));

  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code).toBeTruthy();

  const phone = await openPhone(browser, code!);
  phone.on('pageerror', e => errors.push(`phone: ${e.message}`));
  await phone.getByRole('textbox', { name: 'Your name' }).fill('Sh1t Head');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: /^You're in, / })).toBeVisible();
  await expect(phone.getByRole('banner')).not.toContainText(/sh1t/i);
  const lobby = host.getByRole('dialog', { name: 'Live room' });
  await expect(lobby).toContainText('1 connected');
  await expect(lobby).not.toContainText(/sh1t/i);

  // Package R2: going offline shows a clear banner, and coming back clears it with no tap.
  await phone.context().setOffline(true);
  await expect(phone.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible();
  await phone.context().setOffline(false);
  await expect(phone.getByRole('status').filter({ hasText: "You're offline" })).toHaveCount(0, { timeout: 10_000 });

  // The teacher removes the phone; it cannot join again, even under another name.
  await lobby.getByRole('button', { name: /^Remove / }).click();
  await expect(lobby).not.toContainText('1 connected');
  await phone.reload();
  const nameBox = phone.getByRole('textbox', { name: 'Your name' });
  await expect(nameBox).toBeVisible();
  await nameBox.fill('Ana');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByText('The teacher removed you from this room.')).toBeVisible();

  expect(errors).toEqual([]);
});
