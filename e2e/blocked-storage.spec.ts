import { test, expect } from '@playwright/test';
import { E2E_URL } from './helpers';

/**
 * Package F8: some browsers refuse to store anything (private windows, blocked site data, full
 * storage). The game must still run on the teacher's screen and a phone must still join.
 */
const BLOCK_STORAGE = () => {
  const refuse = () => {
    throw new DOMException('Storage is blocked', 'SecurityError');
  };
  Storage.prototype.getItem = refuse;
  Storage.prototype.setItem = refuse;
  Storage.prototype.removeItem = refuse;
};

test('the game and a phone work when the browser refuses to store anything', async ({ page: host, browser }) => {
  const errors: string[] = [];
  host.on('pageerror', (e) => errors.push(`host: ${e.message}`));
  await host.addInitScript(BLOCK_STORAGE);

  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code, 'room code on the host screen').toBeTruthy();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(BLOCK_STORAGE);
  const phone = await context.newPage();
  phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await phone.goto(`${E2E_URL}&room=${code}`);
  await phone.getByRole('textbox', { name: 'Your name' }).fill('Ivo');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: "You're in, Ivo!" })).toBeVisible();

  // The theme switch writes to storage; it must still work for this tab.
  await host.getByRole('button', { name: 'Back to the table' }).click();
  const html = host.locator('html');
  const wasDark = ((await html.getAttribute('class')) || '').includes('dark');
  await host.getByRole('button', { name: /^Switch to the (light|dark) theme$/ }).first().click();
  await expect.poll(async () => ((await html.getAttribute('class')) || '').includes('dark')).toBe(!wasDark);

  expect(errors).toEqual([]);
  await context.close();
});
