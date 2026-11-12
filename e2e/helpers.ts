import { expect, type Locator, type Page } from '@playwright/test';

/** Known answers for the fixed browser-test sentences (utils/e2eContent.ts). */
export const KNOWN = {
  binaryValidText: 'She has lived in Lisbon since 2019.',
  binaryFlawedText: 'He have finished his homework already.',
  multipleChoiceAnswer: 'had',
  multipleChoiceWrong: 'have',
} as const;

export const E2E_URL = '/?e2e=1';

/** Reads "$1,234" style text as a number. */
export function money(text: string): number {
  const m = text.replace(/[,\s]/g, '').match(/\$(-?\d+)/);
  if (!m) throw new Error(`No money amount in "${text}"`);
  return Number(m[1]);
}

/** Clicks a button that may be gently animated (the reveal button breathes). */
export async function clickButton(scope: Page | Locator, name: RegExp | string) {
  const button = scope.getByRole('button', { name }).first();
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  // Not a mouse click at the button's position: the reveal button breathes (never "stable"), and right
  // after a reveal the results screen is still growing, so a position read a moment earlier can be
  // off screen or on another control. A click event sent to the button itself is what a tap does.
  await button.dispatchEvent('click');
}

export async function addPlayers(page: Page, names: string[]) {
  for (const name of names) {
    await page.getByPlaceholder('Player name').fill(name);
    await page.getByRole('button', { name: 'Add player' }).click();
  }
}

/** Mixed mode with only the given question types, a fixed number of hands, no timer. */
export async function setUpMixedGame(page: Page, opts: { drop: string[]; hands: number }) {
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: /Mixed/ }).first().click();
  for (const label of opts.drop) {
    await page.getByRole('checkbox', { name: label }).click();
  }
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: /Set number of hands/ }).click();
  await page.locator('input[type="number"]:visible').first().fill(String(opts.hands));
}

export function sentence(page: Page): Locator {
  return page.locator('p.font-sentence').first();
}

export function card(page: Page, name: string): Locator {
  return page.locator(`[data-testid="betting-card"][data-player-name="${name}"]`);
}

/** Checks a player's balance in the results table after a reveal. */
export async function expectResultBalance(page: Page, name: string, amount: number) {
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
  await expect(row.first()).toContainText('$' + amount.toLocaleString('en-US'));
}

/** Matches a player's name followed closely by an exact money amount. */
export function nameWithMoney(name: string, amount: number): RegExp {
  return new RegExp(`${name}[\\s\\S]{0,120}\\$${amount.toLocaleString('en-US')}(?!\\d)`);
}
