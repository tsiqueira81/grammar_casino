import { test, expect, type Page } from '@playwright/test';
import { E2E_URL } from './helpers';

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

/** Seconds left on an m:ss clock. */
async function secondsOn(clock: ReturnType<Page['locator']>): Promise<number> {
  const text = (await clock.innerText()).trim();
  const m = text.match(/(\d+):(\d\d)/);
  if (!m) throw new Error(`No clock in "${text}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Package R3: a phone whose clock is 30 s fast shows the same time left as the teacher's screen. */
test('a phone with a wrong clock shows the same countdown as the teacher', async ({ page: host, browser }) => {
  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code).toBeTruthy();

  const context = await browser.newContext(PHONE);
  await context.addInitScript(() => {
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + 30_000;
  });
  const phone = await context.newPage();
  await phone.goto(`${E2E_URL}&room=${code}`);
  await phone.getByRole('textbox', { name: 'Your name' }).fill('Dani');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: "You're in, Dani!" })).toBeVisible();

  await host.getByRole('button', { name: 'Back to the table' }).click();
  await host.getByRole('button', { name: 'Set up the game' }).click();
  await host.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await host.getByRole('button', { name: 'Next: house rules' }).click();
  await host.getByRole('group', { name: 'Round timer' }).getByRole('button', { name: /^120 s/ }).click();
  await host.getByRole('button', { name: 'Deal the first hand' }).click();

  const hostClock = host.getByTestId('host-round-clock');
  const phoneClock = phone.getByRole('timer');
  await expect(phoneClock).toContainText('Time left');
  await expect(hostClock).toBeVisible();
  // Give the phone a few updates to learn the difference, then compare.
  await expect.poll(async () => Math.abs((await secondsOn(hostClock)) - (await secondsOn(phoneClock))), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  expect(await secondsOn(phoneClock)).toBeGreaterThan(60);
});
