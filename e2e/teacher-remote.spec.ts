import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_URL, KNOWN, clickButton } from './helpers';

/**
 * Package T3: the teacher's own phone as a remote. The remote pairs with a one-time link, is never
 * a player, sees the answer and who is still deciding, and runs a whole hand (reveal, then deal the
 * next) while nobody touches the teacher's screen. A second phone with the same link is refused,
 * and unpairing tells the phone it is no longer the remote.
 */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext(PHONE);
  return context.newPage();
}

test('the teacher runs a hand from a paired phone', async ({ page: host, browser }) => {
  const errors: string[] = [];
  host.on('pageerror', e => errors.push(`host: ${e.message}`));

  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code).toBeTruthy();
  await expect(host.getByRole('dialog').getByText('Room online')).toBeVisible();

  // One student.
  const dani = await newPhone(browser);
  await dani.goto(`${E2E_URL}&room=${code}`);
  await dani.getByRole('textbox', { name: 'Your name' }).fill('Dani');
  await dani.getByRole('button', { name: 'Join the table' }).click();
  await expect(dani.getByRole('heading', { name: "You're in, Dani!" })).toBeVisible();

  // Pair the remote. The QR code stays hidden until asked for (the screen may be projected).
  await host.getByTestId('open-teacher-remote').click();
  const pair = host.getByTestId('remote-pair');
  await pair.getByTestId('remote-make-link').click();
  await expect(pair.getByRole('img', { name: /QR code/ })).toHaveCount(0);
  await pair.getByTestId('remote-show-qr').click();
  await expect(pair.getByRole('img', { name: /QR code/ })).toBeVisible();
  const link = await pair.getAttribute('data-remote-url');
  expect(link).toMatch(new RegExp(`\\?room=${code}&remote=[0-9a-f]{16}$`));

  const remote = await newPhone(browser);
  remote.on('pageerror', e => errors.push(`remote: ${e.message}`));
  await remote.goto(link!);
  // Pairing closes the window on the teacher's screen, so the link is off the projector.
  await expect(pair).toHaveCount(0);
  await expect(remote.getByTestId('remote-primary')).toBeVisible();

  // A second phone with the same link is told it is not the remote.
  const stranger = await newPhone(browser);
  await stranger.goto(link!);
  await expect(stranger.getByTestId('remote-ended')).toBeVisible();

  // Multiple-choice game, dealt from the teacher's screen.
  await host.getByRole('button', { name: 'Set up the game' }).click();
  await host.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await host.getByRole('button', { name: 'Next: house rules' }).click();
  await host.getByRole('button', { name: 'Deal the first hand' }).click();

  // The remote is not a player: only Dani is at the table.
  await expect(host.getByRole('button', { name: /Teacher remote.*Open betting card/ })).toHaveCount(0);

  // The remote sees the answer and who is still deciding.
  await expect(remote.getByTestId('remote-answer')).toContainText(KNOWN.multipleChoiceAnswer);
  await expect(remote.getByTestId('remote-waiting')).toContainText('0 of 1 locked in');
  await expect(remote.getByTestId('remote-waiting')).toContainText('Still deciding: Dani');
  // A student's phone never gets the answer from the remote's view.
  await expect(dani.getByText(/^Answer:/)).toHaveCount(0);

  await dani.getByRole('button', { name: new RegExp(`^[A-D] ${KNOWN.multipleChoiceAnswer}$`) }).click();
  await dani.getByRole('textbox', { name: 'Your bet in dollars' }).fill('100');
  await clickButton(dani, /^Lock in \$100 on/);
  await expect(remote.getByTestId('remote-waiting')).toContainText('1 of 1 locked in');

  // The remote reveals the answer...
  await expect(remote.getByTestId('remote-primary')).toHaveText('Reveal the answer');
  await remote.getByTestId('remote-primary').click();
  await expect(dani.getByRole('status').filter({ hasText: '$' }).first()).toHaveText('+$100');
  // ...and deals the next hand.
  await expect(remote.getByTestId('remote-primary')).toHaveText('Deal the next hand');
  await remote.getByTestId('remote-primary').click();
  await expect(remote.getByTestId('remote-round')).toContainText('Hand 2');
  await expect(remote.getByTestId('remote-primary')).toHaveText('Reveal the answer');

  // Unpair from the teacher's screen: the phone is told, and its buttons are gone.
  await host.getByRole('button', { name: /^Room [A-Z0-9]{4} · QR code/ }).click();
  await expect(host.getByTestId('open-teacher-remote')).toHaveText(/paired/);
  await host.getByTestId('open-teacher-remote').click();
  await host.getByTestId('remote-pair').getByRole('button', { name: 'Unpair this phone' }).click();
  await expect(remote.getByTestId('remote-ended')).toBeVisible();
  await expect(remote.getByTestId('remote-primary')).toHaveCount(0);

  expect(errors).toEqual([]);
});
