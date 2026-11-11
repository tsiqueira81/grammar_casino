import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E_URL, KNOWN, clickButton } from './helpers';

/**
 * A live room: the teacher's screen opens a room, three phones join by code,
 * bet and lock in, one phone is reloaded mid-hand and must get its seat back,
 * the teacher's page is reloaded and must reopen the same room, the teacher reveals, and each phone shows its own result and the explanation.
 * Runs over the dev server's local relay (no Firestore).
 */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

// What each phone has heard back from the teacher's screen, to know when a bet has arrived there.
const framesReceived = new WeakMap<Page, string[]>();

async function joinPhone(browser: Browser, code: string, name: string): Promise<Page> {
  const context = await browser.newContext(PHONE);
  const phone = await context.newPage();
  const frames: string[] = [];
  framesReceived.set(phone, frames);
  phone.on('websocket', ws => ws.on('framereceived', f => frames.push(String(f.payload))));
  await phone.goto(`${E2E_URL}&room=${code}`);
  // Package S9: the link holds the code, so the phone asks only for a name.
  await expect(phone.getByTestId('joining-room')).toContainText(code);
  await expect(phone.getByRole('textbox', { name: 'Room code' })).toHaveCount(0);
  await phone.getByRole('textbox', { name: 'Your name' }).fill(name);
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: `You're in, ${name}!` })).toBeVisible();
  return phone;
}

async function placeBet(phone: Page, option: string, amount: number) {
  await phone.getByRole('button', { name: new RegExp(`^[A-D] ${option}$`) }).click();
  await phone.getByRole('textbox', { name: 'Your bet in dollars' }).fill(String(amount));
}

/** Waits until the teacher's screen has sent this phone a view that holds its stake. */
async function waitForHostToHoldBet(phone: Page, amount: number) {
  const holdsBet = new RegExp(`"myBet":\\{[^}]*"bet":${amount}[,}]`);
  await expect
    .poll(() => (framesReceived.get(phone) || []).some(f => holdsBet.test(f)), { message: `host holds the $${amount} bet` })
    .toBe(true);
}

test('three phones play a hand in a live room, surviving a phone reload and a teacher reload', async ({ page: host, browser }) => {
  const errors: string[] = [];
  host.on('pageerror', e => errors.push(`host: ${e.message}`));

  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code, 'room code on the host screen').toBeTruthy();
  await expect(host.getByRole('dialog').getByText('Room online')).toBeVisible();

  const players = [
    { name: 'Dani', option: KNOWN.multipleChoiceAnswer, bet: 100, delta: '+$100', balance: '$1,100' },
    { name: 'Eva', option: KNOWN.multipleChoiceWrong, bet: 50, delta: '\u2212$50', balance: '$950' },
    { name: 'Fabio', option: KNOWN.multipleChoiceAnswer, bet: 200, delta: '+$200', balance: '$1,200' },
  ];
  const phones: Page[] = [];
  for (const p of players) {
    const phone = await joinPhone(browser, code!, p.name);
    phone.on('pageerror', e => errors.push(`${p.name}: ${e.message}`));
    phones.push(phone);
  }
  await expect(host.getByRole('dialog')).toContainText('3 connected');

  // Package S6: each phone has its own comfort settings, kept on that phone.
  const eva = phones[1];
  await eva.getByTestId('comfort-button').click();
  await eva.getByRole('button', { name: 'Larger' }).click();
  await expect(eva.locator('html')).toHaveClass(/gc-text-zoom/);
  await eva.getByRole('button', { name: 'Normal' }).click();
  await expect(eva.locator('html')).not.toHaveClass(/gc-text-zoom/);
  await eva.getByRole('switch', { name: /Plain font/ }).click();
  await expect(eva.locator('html')).toHaveClass(/gc-plain-font/);
  await eva.getByTestId('comfort-panel').getByRole('button', { name: 'Done' }).click();
  await expect(phones[0].locator('html')).not.toHaveClass(/gc-plain-font/);

  // Multiple-choice game, dealt from the teacher's screen.
  await host.getByRole('button', { name: 'Back to the table' }).click();
  await host.getByRole('button', { name: 'Set up the game' }).click();
  await host.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await host.getByRole('button', { name: 'Next: house rules' }).click();
  await host.getByRole('button', { name: 'Deal the first hand' }).click();

  for (const phone of phones) {
    await expect(phone.getByRole('region', { name: 'The sentence' })).toContainText('more time');
  }

  // The teacher pauses the hand (package R8): every phone shows the pause card until it resumes.
  await host.getByRole('button', { name: 'Pause', exact: true }).click();
  for (const phone of phones) {
    await expect(phone.getByRole('alert').filter({ hasText: 'Your teacher paused the game' })).toBeVisible();
  }
  await host.getByRole('button', { name: 'Resume the hand' }).click();
  for (const phone of phones) {
    await expect(phone.getByRole('alert').filter({ hasText: 'Your teacher paused the game' })).toHaveCount(0);
  }

  // Everyone bets; Eva's phone is reloaded before she locks in.
  for (let i = 0; i < players.length; i++) {
    await placeBet(phones[i], players[i].option, players[i].bet);
  }
  // A reload right after typing could cut off the bet before it reaches the teacher's screen.
  await waitForHostToHoldBet(phones[1], players[1].bet);
  await phones[1].reload();
  await expect(phones[1].getByRole('banner')).toContainText('Eva');
  await expect(phones[1].getByRole('region', { name: 'The sentence' })).toContainText('more time');
  // The seat came back with its bet: the lock-in button already names the stake.
  await expect(phones[1].getByRole('button', { name: /^Lock in \$50 on/ })).toBeVisible();

  // The teacher's page reloads mid-hand (package R1): the same room opens again within
  // five seconds, and every phone keeps its seat and its stake.
  await host.reload();
  await expect(host.getByRole('status').filter({ hasText: `Room ${code} is open again` })).toBeVisible({ timeout: 5000 });
  for (let i = 0; i < players.length; i++) {
    const lockIn = new RegExp(`^Lock in \\$${players[i].bet} on`);
    await expect(phones[i].getByRole('button', { name: lockIn })).toBeVisible({ timeout: 5000 });
  }

  for (let i = 0; i < players.length; i++) {
    await clickButton(phones[i], new RegExp(`^Lock in \\$${players[i].bet} on`));
  }

  await clickButton(host, /^Reveal the answer/);

  for (let i = 0; i < players.length; i++) {
    const phone = phones[i];
    await expect(phone.getByRole('status').filter({ hasText: '$' }).first()).toHaveText(players[i].delta);
    await expect(phone.getByText(/^Balance/)).toContainText(players[i].balance);
    await expect(phone.getByText('Second conditional: if + past simple, would + base form.')).toBeVisible();
    // Package L5: the phone shows the student's own answer beside the right one.
    await expect(phone.getByTestId('my-answer')).toContainText(players[i].option);
  }

  // Package S4: each phone says where it stands and how far it is to the next place.
  await expect(phones[2].getByTestId('my-place')).toHaveText('You are 1st of 3. You are in the lead.');
  await expect(phones[0].getByTestId('my-place')).toHaveText('You are 2nd of 3. $101 more to pass Fabio.');
  await expect(phones[1].getByTestId('my-place')).toHaveText('You are 3rd of 3. $151 more to pass Dani.');

  // Package L5: "Got it" / "Still confused" reach the teacher, beside what the class answered.
  await phones[0].getByRole('button', { name: 'Got it' }).click();
  await phones[1].getByRole('button', { name: 'Still confused' }).click();
  await expect(phones[1].getByRole('button', { name: 'Still confused' })).toHaveAttribute('aria-pressed', 'true');
  await expect(host.getByTestId('reaction-counts')).toHaveText('1 got it · 1 still confused');
  const split = host.getByTestId('answer-split');
  await expect(split.getByRole('listitem').first()).toContainText(KNOWN.multipleChoiceAnswer);
  await expect(split.getByRole('listitem').first()).toContainText('2');

  expect(errors).toEqual([]);
});
