import { test, expect, type Page } from '@playwright/test';
import { E2E_URL, clickButton } from './helpers';

/**
 * Package S2: the phone never changes what a student typed, Enter moves on or locks in,
 * every control is big enough for a thumb, and nothing scrolls sideways on a small phone.
 */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

/** Visible controls smaller than 44 by 44 CSS pixels, described for the failure message. */
async function smallTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="radio"], [role="checkbox"]';
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') return;
      if ((el as HTMLButtonElement).disabled) return;
      // A control inside a bigger tappable label counts as that label.
      const label = el.closest('label');
      const box = label ? label.getBoundingClientRect() : rect;
      if (box.width < 43.5 || box.height < 43.5) {
        const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName;
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    });
    return out;
  });
}

async function hasSidewaysScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function checkAtWidths(page: Page, label: string) {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.waitForTimeout(150);
    expect.soft(await smallTapTargets(page), `${label} at ${width}px: controls under 44px`).toEqual([]);
    if (width === 320) {
      expect.soft(await hasSidewaysScroll(page), `${label} at 320px scrolls sideways`).toBe(false);
    }
  }
  await page.setViewportSize(PHONE.viewport);
}

test('a phone keeps exactly what the student typed, and every control fits a thumb', async ({ page: host, browser }) => {
  const errors: string[] = [];
  host.on('pageerror', (e) => errors.push(`host: ${e.message}`));

  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code, 'room code on the host screen').toBeTruthy();

  const context = await browser.newContext(PHONE);
  const phone = await context.newPage();
  phone.on('pageerror', (e) => errors.push(`phone: ${e.message}`));

  // Every intent the phone sends, by WebSocket or HTTP, so the test can read the submitted answer.
  const sent: string[] = [];
  phone.on('websocket', (ws) => ws.on('framesent', (frame) => sent.push(String(frame.payload))));
  phone.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/mp/')) sent.push(req.postData() || '');
  });

  await phone.goto(`${E2E_URL}&room=${code}`);
  await checkAtWidths(phone, 'join form');
  await phone.getByRole('textbox', { name: 'Your name' }).fill('Gil');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: "You're in, Gil!" })).toBeVisible();
  await checkAtWidths(phone, 'waiting screen');

  // An open-cloze hand.
  await host.getByRole('button', { name: 'Back to the table' }).click();
  await host.getByRole('button', { name: 'Set up the game' }).click();
  await host.getByRole('button', { name: /^Open cloze/ }).click();
  await host.getByRole('button', { name: 'Next: house rules' }).click();
  await host.getByRole('button', { name: 'Deal the first hand' }).click();

  const answer = phone.getByRole('textbox', { name: 'Your answer' });
  await expect(answer).toBeVisible();
  await checkAtWidths(phone, 'betting screen');

  // The phone must not capitalise, autocorrect or spell-check a grammar answer.
  await expect(answer).toHaveAttribute('autocapitalize', 'none');
  await expect(answer).toHaveAttribute('autocorrect', 'off');
  await expect(answer).toHaveAttribute('autocomplete', 'off');
  await expect(answer).toHaveAttribute('spellcheck', 'false');
  await expect(answer).toHaveAttribute('enterkeyhint', 'done');

  // Enter on the answer moves to the stake; Enter on the stake locks in.
  await answer.click();
  await answer.pressSequentially("i'm");
  await answer.press('Enter');
  const stake = phone.getByRole('textbox', { name: 'Your bet in dollars' });
  await expect(stake).toBeFocused();
  await stake.pressSequentially('50');
  await stake.press('Enter');
  await expect(phone.getByRole('heading', { name: "You're locked in" })).toBeVisible();
  await expect(phone.getByText("i'm", { exact: true })).toBeVisible();
  await checkAtWidths(phone, 'locked-in screen');

  const lockIntent = sent.find((body) => body.includes('"LOCK_IN"'));
  expect(lockIntent, 'the phone sent its lock-in').toBeTruthy();
  expect(lockIntent).toContain('"clozeAnswer":"i\'m"');

  // Leaving asks first; saying no keeps the seat.
  phone.once('dialog', (dialog) => dialog.dismiss());
  await phone.getByRole('button', { name: 'Leave the room' }).click();
  await expect(phone.getByRole('heading', { name: "You're locked in" })).toBeVisible();

  await clickButton(host, /^Reveal the answer/);
  await expect(phone.getByText(/^Balance/)).toBeVisible();
  await checkAtWidths(phone, 'results screen');

  expect(errors).toEqual([]);
  await context.close();
});
