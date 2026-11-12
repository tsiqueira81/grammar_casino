import { test, expect, type Page } from '@playwright/test';
import { E2E_URL, KNOWN, clickButton } from './helpers';

/**
 * Package R2: a bet made while the phone is offline. Nothing the phone sends gets through while
 * it is offline (the test drops it). Back online while the hand is open, the phone sends the bet
 * again by itself; back online after the hand closed, it says plainly that the bet did not arrive.
 */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

test('a bet made offline is sent again, or the phone says it did not arrive', async ({ page: host, browser }) => {
  const errors: string[] = [];
  host.on('pageerror', e => errors.push(`host: ${e.message}`));

  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code).toBeTruthy();

  const context = await browser.newContext(PHONE);
  const phone: Page = await context.newPage();
  phone.on('pageerror', e => errors.push(`phone: ${e.message}`));
  let dropping = false;
  const frames: string[] = [];
  await phone.routeWebSocket(/.*/, ws => {
    const server = ws.connectToServer();
    ws.onMessage(m => {
      if (dropping && String(m).includes('STUDENT_INTENT')) return;
      server.send(m);
    });
    server.onMessage(m => {
      frames.push(String(m));
      ws.send(m);
    });
  });
  await phone.route('**/api/mp/room/*/intent', route => (dropping ? route.abort() : route.continue()));
  const goOffline = async () => {
    dropping = true;
    await context.setOffline(true);
    await expect(phone.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible();
  };
  const goOnline = async () => {
    // The network comes back as a whole: the phone may resend the moment it sees it is online,
    // so the test stops dropping first rather than after the banner goes.
    dropping = false;
    await context.setOffline(false);
    await expect(phone.getByRole('status').filter({ hasText: "You're offline" })).toHaveCount(0, { timeout: 10_000 });
  };

  await phone.goto(`${E2E_URL}&room=${code}`);
  await phone.getByRole('textbox', { name: 'Your name' }).fill('Dani');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: "You're in, Dani!" })).toBeVisible();

  await host.getByRole('button', { name: 'Back to the table' }).click();
  await host.getByRole('button', { name: 'Set up the game' }).click();
  await host.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await host.getByRole('button', { name: 'Next: house rules' }).click();
  await host.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(phone.getByRole('region', { name: 'The sentence' })).toContainText('more time');

  // Hand 1: the bet is made offline, and arrives once the phone is back, with no tap.
  await goOffline();
  await phone.getByRole('button', { name: new RegExp(`^[A-D] ${KNOWN.multipleChoiceAnswer}$`) }).click();
  await phone.getByRole('textbox', { name: 'Your bet in dollars' }).fill('100');
  await phone.waitForTimeout(600);
  expect(frames.some(f => /"myBet":\{[^}]*"bet":100[,}]/.test(f))).toBe(false);
  await goOnline();
  await expect.poll(() => frames.some(f => /"myBet":\{[^}]*"bet":100[,}]/.test(f)), { message: 'the teacher holds the bet' }).toBe(true);
  await clickButton(phone, /^Lock in \$100 on/);
  await clickButton(host, /^Reveal the answer/);
  await expect(phone.getByRole('status').filter({ hasText: '$' }).first()).toHaveText('+$100');
  await expect(phone.getByTestId('bet-lost')).toHaveCount(0);

  // Hand 2: the teacher reveals while the phone is still offline.
  await clickButton(host, /^Deal the next hand/);
  await expect(phone.getByRole('region', { name: 'The sentence' })).toBeVisible();
  await goOffline();
  await phone.getByRole('button', { name: /^A / }).click();
  await phone.getByRole('textbox', { name: 'Your bet in dollars' }).fill('50');
  await host.getByRole('button', { name: 'Reveal now' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Reveal now' }).click();
  await goOnline();
  await expect(phone.getByTestId('bet-lost')).toContainText('That bet did not reach the table.');

  expect(errors).toEqual([]);
});
