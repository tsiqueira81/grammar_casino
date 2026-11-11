import { test, expect } from '@playwright/test';
import { KNOWN, E2E_URL, addPlayers, setUpMixedGame, sentence, card, clickButton, expectResultBalance } from './helpers';

/**
 * Single-screen game on the teacher's computer: three players, two hands
 * (one valid-or-flawed, one multiple choice) with known right and wrong bets,
 * then the podium. A win pays the stake, a loss costs the stake.
 */
test('a local game plays two hands and ranks the players', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno', 'Caio']);
  await setUpMixedGame(page, {
    drop: ['Open cloze', 'Word formation', 'Key word'],
    hands: 2,
  });
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  // Hand 1: valid or flawed. The deck decides which; the test reads it.
  await expect(sentence(page)).toContainText(/Lisbon|homework/);
  const isValid = (await sentence(page).innerText()).includes('Lisbon');
  const right = isValid ? /^Valid/ : /^Flawed/;
  const wrong = isValid ? /^Flawed/ : /^Valid/;

  await page.getByRole('button', { name: 'Full cards' }).click();
  const hand1 = [
    { name: 'Ana', pick: right, bet: 100 },
    { name: 'Bruno', pick: wrong, bet: 50 },
    { name: 'Caio', pick: right, bet: 200 },
  ];
  for (const h of hand1) {
    const c = card(page, h.name);
    await c.getByRole('button', { name: h.pick }).click();
    await c.getByPlaceholder('Your bet').fill(String(h.bet));
  }
  // Package V3: the pot plaque shows every bet on the table.
  await expect(page.getByTestId('pot-plaque')).toContainText('$350');
  await clickButton(page, /^Reveal the answer/);

  for (const [name, amount] of Object.entries({ Ana: 1100, Bruno: 950, Caio: 1200 })) {
    await expectResultBalance(page, name, amount);
  }

  // Hand 2: multiple choice. "had" is right.
  await clickButton(page, 'Deal the next hand');
  await expect(sentence(page)).toContainText('more time');
  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  const hand2 = [
    { name: 'Ana', option: KNOWN.multipleChoiceWrong, bet: 100 },
    { name: 'Bruno', option: KNOWN.multipleChoiceAnswer, bet: 300 },
    { name: 'Caio', option: KNOWN.multipleChoiceAnswer, bet: 10 },
  ];
  for (const h of hand2) {
    const c = card(page, h.name);
    await c.getByRole('button', { name: new RegExp(`(^|\\W)${h.option}$`) }).first().click();
    await c.getByPlaceholder('Your bet').fill(String(h.bet));
  }
  await clickButton(page, /^Reveal the answer/);

  for (const [name, amount] of Object.entries({ Ana: 1000, Bruno: 1250, Caio: 1210 })) {
    await expectResultBalance(page, name, amount);
  }

  // End of the game: Bruno first, Caio second, Ana third.
  await clickButton(page, /See the final results/);
  await expect(page.getByText('Bruno wins with $1,250.')).toBeVisible();
  const podium = page.getByRole('list', { name: 'Top three players' });
  await expect(podium.getByRole('listitem').filter({ hasText: 'Place 1:' })).toContainText(/Bruno\s*\$1,250/);
  await expect(podium.getByRole('listitem').filter({ hasText: 'Place 2:' })).toContainText(/Caio\s*\$1,210/);
  await expect(podium.getByRole('listitem').filter({ hasText: 'Place 3:' })).toContainText(/Ana\s*\$1,000/);

  // Package V9: the ceremony ends on the class result, and the podium can be saved as a picture.
  await expect(page.getByTestId('class-result')).toContainText(/Together you got \d+% right\./);
  await expect(page.getByTestId('class-result')).toHaveCSS('opacity', '1', { timeout: 10_000 });
  await expect(page.getByTestId('ceremony-skip')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save this moment' }).click();
  expect((await download).suggestedFilename()).toMatch(/^grammar-casino-.*\.png$/);

  expect(errors).toEqual([]);
});

/** Package G3: a new game starts in "Most money after N hands"; the other modes stay selectable. */
test('a new game starts in the set-number-of-hands mode', async ({ page }) => {
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: /Mixed/ }).first().click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await expect(page.getByRole('button', { name: /Set number of hands/ })).toHaveAttribute('aria-pressed', 'true');
  const last = page.getByRole('button', { name: /Last player standing/ });
  await last.click();
  await expect(last).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Target amount/ })).toBeVisible();
});

/** Package G9: in single-screen play a player at $0 is bankrupt for good, and the game goes on. */
test('a player who loses everything is shown as bankrupt and the others play on', async ({ page }) => {
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno', 'Caio']);
  await setUpMixedGame(page, { drop: ['Open cloze', 'Word formation', 'Key word'], hands: 3 });
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(sentence(page)).toContainText(/Lisbon|homework/);
  const isValid = (await sentence(page).innerText()).includes('Lisbon');
  const right = isValid ? /^Valid/ : /^Flawed/;
  const wrong = isValid ? /^Flawed/ : /^Valid/;

  await page.getByRole('button', { name: 'Full cards' }).click();
  await card(page, 'Ana').getByRole('button', { name: wrong }).click();
  await card(page, 'Ana').getByPlaceholder('Your bet').fill('1000');
  for (const name of ['Bruno', 'Caio']) {
    await card(page, name).getByRole('button', { name: right }).click();
    await card(page, name).getByPlaceholder('Your bet').fill('100');
  }
  await clickButton(page, /^Reveal the answer/);
  await expectResultBalance(page, 'Ana', 0);

  await clickButton(page, 'Deal the next hand');
  await expect(sentence(page)).toBeVisible();
  await expect(page.getByText(/bankrupt/i).first()).toBeVisible();
  await expect(page.getByText('Out until the next hand')).toHaveCount(0);
});
