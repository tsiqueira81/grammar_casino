import { test, expect } from '@playwright/test';
import { KNOWN, E2E_URL, addPlayers, card, clickButton, expectResultBalance } from './helpers';

/** Package G6: with special hands on, the last hand is the Final Table and its wins pay double. */
test('the Final Table pays wins double and leaves losses as they are', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: /Set number of hands/ }).click();
  await page.locator('input[type="number"]:visible').first().fill('1');
  const special = page.getByRole('switch', { name: 'Special hands' });
  await expect(special).toHaveAttribute('aria-checked', 'false');
  await special.click();
  await expect(special).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  await expect(page.getByTestId('special-hand-card')).toContainText('Final Table');
  await expect(page.getByText(/Hand 1 of 1 · .* · Final Table 2×/).first()).toBeVisible();
  // The balances stay hidden on the big screen until the reveal.
  await expect(page.getByTestId('tile-money').first()).toHaveText('$ ? ? ?');

  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  const bets = [
    { name: 'Ana', option: KNOWN.multipleChoiceAnswer, bet: 100 },
    { name: 'Bruno', option: KNOWN.multipleChoiceWrong, bet: 50 },
  ];
  for (const b of bets) {
    const c = card(page, b.name);
    await c.getByRole('button', { name: new RegExp(`(^|\\W)${b.option}$`) }).first().click();
    await c.getByPlaceholder('Your bet').fill(String(b.bet));
  }
  await clickButton(page, /^Reveal the answer/);
  await expectResultBalance(page, 'Ana', 1200);
  await expectResultBalance(page, 'Bruno', 950);
  await expect(page.getByText(/Final Table \(2×\)/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a phone in a live room shows the Final Table', async ({ page: host, browser }) => {
  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  expect(code).toBeTruthy();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  await phone.goto(`${E2E_URL}&room=${code}`);
  await phone.getByRole('textbox', { name: 'Your name' }).fill('Dani');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: "You're in, Dani!" })).toBeVisible();

  await host.getByRole('button', { name: 'Back to the table' }).click();
  await host.getByRole('button', { name: 'Set up the game' }).click();
  await host.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await host.getByRole('button', { name: 'Next: house rules' }).click();
  await host.getByRole('button', { name: /Set number of hands/ }).click();
  await host.locator('input[type="number"]:visible').first().fill('1');
  const special = host.getByRole('switch', { name: 'Special hands' });
  if ((await special.getAttribute('aria-checked')) !== 'true') await special.click();
  await host.getByRole('button', { name: 'Deal the first hand' }).click();

  await expect(phone.getByTestId('phone-special-hand')).toContainText('Final Table');
  await expect(phone.getByTestId('phone-special-hand')).toContainText('Every win pays double');

  // Package L7: a missed hand comes back on the phone's slip at game over, with the right answer.
  await phone.getByRole('button', { name: new RegExp(`^[A-D] ${KNOWN.multipleChoiceWrong}$`) }).click();
  await phone.getByRole('textbox', { name: 'Your bet in dollars' }).fill('50');
  await clickButton(phone, /^Lock in \$50 on/);
  await clickButton(host, /^Reveal the answer/);
  await clickButton(host, /See the final results/);
  await expect(phone.getByTestId('my-review')).toContainText('One to review');
  await expect(phone.getByTestId('my-review')).toContainText(KNOWN.multipleChoiceAnswer);
  // Package L6: "Practice these" replays the missed hand as a solo quiz.
  await phone.getByTestId('practice-these').click();
  const quiz = phone.getByTestId('practice-quiz');
  await expect(quiz).toContainText('Practice 1 of 1');
  await quiz.getByRole('button', { name: new RegExp(`${KNOWN.multipleChoiceAnswer}$`) }).click();
  await expect(quiz.getByTestId('practice-result')).toContainText('Right!');
  await quiz.getByRole('button', { name: 'See my score' }).click();
  await expect(quiz.getByTestId('practice-score')).toHaveText('1 of 1 right. Well done!');
  await context.close();
});

test('a listening hand hides the sentence on the projector and the phones until the reveal', async ({ page: host, browser }) => {
  await host.goto(E2E_URL);
  await host.getByRole('button', { name: 'Open a live room' }).click();
  const roomButton = host.getByRole('button', { name: /^Room [A-Z0-9]{4}/ });
  const code = ((await roomButton.textContent()) || '').match(/Room\s*([A-Z0-9]{4})/)?.[1];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  await phone.goto(`${E2E_URL}&room=${code}`);
  await phone.getByRole('textbox', { name: 'Your name' }).fill('Dani');
  await phone.getByRole('button', { name: 'Join the table' }).click();
  await expect(phone.getByRole('heading', { name: "You're in, Dani!" })).toBeVisible();

  await host.getByRole('button', { name: 'Back to the table' }).click();
  await host.getByRole('button', { name: 'Set up the game' }).click();
  await host.getByRole('button', { name: /^Valid or flawed/ }).click();
  await host.getByRole('button', { name: 'Next: house rules' }).click();
  await host.getByRole('button', { name: /Set number of hands/ }).click();
  await host.locator('input[type="number"]:visible').first().fill('4');
  const special = host.getByRole('switch', { name: 'Special hands' });
  if ((await special.getAttribute('aria-checked')) !== 'true') await special.click();
  await host.getByRole('button', { name: 'Deal the first hand' }).click();

  // Hand 1 is ordinary: the sentence is on the phone.
  await expect(phone.getByRole('region', { name: 'The sentence' })).toContainText(/Lisbon|homework/);
  await phone.getByRole('button', { name: /^Valid/ }).first().click();
  await phone.getByRole('textbox', { name: 'Your bet in dollars' }).fill('10');
  await clickButton(phone, /^Lock in \$10 on/);
  await clickButton(host, /^Reveal the answer/);
  await clickButton(host, 'Deal the next hand');

  // Hand 2 of 4 is the listening hand.
  await expect(host.getByTestId('special-hand-card')).toContainText('Listening hand');
  await expect(host.getByTestId('listening-hidden')).toContainText('Listen to the sentence.');
  await expect(host.locator('p.font-sentence').first()).not.toContainText(/Lisbon|homework/);
  await expect(phone.getByTestId('phone-listening')).toBeVisible();
  await expect(phone.getByRole('region', { name: 'The sentence' })).not.toContainText(/Lisbon|homework/);
  await expect(phone.getByTestId('phone-special-hand')).toContainText('Listening hand');

  await phone.getByRole('button', { name: /^Valid/ }).first().click();
  await phone.getByRole('textbox', { name: 'Your bet in dollars' }).fill('10');
  await clickButton(phone, /^Lock in \$10 on/);
  await clickButton(host, /^Reveal the answer/);
  await expect(phone.getByTestId('phone-listening')).toHaveCount(0);
  await expect(host.getByTestId('listening-hidden')).toHaveCount(0);
  await expect(host.getByText(/Lisbon|homework/).first()).toBeVisible();
  await context.close();
});

test('"Say it" asks for the right sentence aloud after the reveal (package L9)', async ({ page }) => {
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  const sayIt = page.getByRole('switch', { name: 'Say it' });
  await expect(sayIt).toHaveAttribute('aria-checked', 'false');
  await sayIt.click();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  const c = card(page, 'Ana');
  await c.getByRole('button', { name: new RegExp(`(^|\\W)${KNOWN.multipleChoiceAnswer}$`) }).first().click();
  await c.getByPlaceholder('Your bet').fill('10');
  await clickButton(page, /^Reveal the answer/);
  await expect(page.getByTestId('say-it')).toContainText('Say it');
  await expect(page.getByTestId('say-it')).toContainText('If I had more time, I would learn Japanese.');
});

test('a right answer on the Spotlight hand earns a free power-up draw', async ({ page }) => {
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: /^Multiple-choice cloze/ }).click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: /Set number of hands/ }).click();
  await page.locator('input[type="number"]:visible').first().fill('6');
  const special = page.getByRole('switch', { name: 'Special hands' });
  if ((await special.getAttribute('aria-checked')) !== 'true') await special.click();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  const play = async (picks: { name: string; option: string; bet: number }[]) => {
    const fullCards = page.getByRole('button', { name: 'Full cards' });
    if (await fullCards.isVisible()) await fullCards.click();
    for (const b of picks) {
      const c = card(page, b.name);
      await c.getByRole('button', { name: new RegExp(`(^|\\W)${b.option}$`) }).first().click();
      await c.getByPlaceholder('Your bet').fill(String(b.bet));
    }
    await clickButton(page, /^Reveal the answer/);
  };

  // Hand 1: both miss, so the point is the class's most missed.
  await play([
    { name: 'Ana', option: KNOWN.multipleChoiceWrong, bet: 10 },
    { name: 'Bruno', option: KNOWN.multipleChoiceWrong, bet: 10 },
  ]);
  await clickButton(page, 'Deal the next hand');

  // Hand 2 of 6 is the Spotlight. Ana is right, Bruno is not.
  await expect(page.getByTestId('special-hand-card')).toContainText('Spotlight');
  await play([
    { name: 'Ana', option: KNOWN.multipleChoiceAnswer, bet: 10 },
    { name: 'Bruno', option: KNOWN.multipleChoiceWrong, bet: 10 },
  ]);
  await expectResultBalance(page, 'Ana', 1000);
  await clickButton(page, 'Deal the next hand');

  // Hand 3: Ana's draw is free, Bruno's is not.
  const fullCards = page.getByRole('button', { name: 'Full cards' });
  if (await fullCards.isVisible()) await fullCards.click();
  await expect(card(page, 'Ana').getByTestId('draw-price')).toHaveText('Free');
  await expect(card(page, 'Bruno').getByTestId('draw-price')).toHaveText('-$50');
});

test('the Fix it hand deals a flawed sentence and shows the class corrections without names', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(E2E_URL);
  await addPlayers(page, ['Ana', 'Bruno']);
  await page.getByRole('button', { name: 'Set up the game' }).click();
  await page.getByRole('button', { name: /^Valid or flawed/ }).click();
  await page.getByRole('button', { name: 'Next: house rules' }).click();
  await page.getByRole('button', { name: /Set number of hands/ }).click();
  await page.locator('input[type="number"]:visible').first().fill('8');
  const special = page.getByRole('switch', { name: 'Special hands' });
  if ((await special.getAttribute('aria-checked')) !== 'true') await special.click();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();

  const fullCards = page.getByRole('button', { name: 'Full cards' });
  // Hands 1 to 5: quick bets.
  for (let hand = 1; hand <= 5; hand++) {
    if (await fullCards.isVisible()) await fullCards.click();
    for (const name of ['Ana', 'Bruno']) {
      const c = card(page, name);
      await c.getByRole('button', { name: /^Valid/ }).first().click();
      await c.getByPlaceholder('Your bet').fill('10');
    }
    await clickButton(page, /^Reveal the answer/);
    await clickButton(page, 'Deal the next hand');
  }

  // Hand 6 of 8 is Fix it: a flawed sentence, and both players type a correction.
  await expect(page.getByTestId('special-hand-card')).toContainText('Fix it');
  await expect(page.locator('p.font-sentence').first()).toContainText('He have finished');
  if (await fullCards.isVisible()) await fullCards.click();
  const fixes = { Ana: 'He has finished his homework already.', Bruno: 'He had finished his homework already.' };
  for (const [name, fix] of Object.entries(fixes)) {
    const c = card(page, name);
    await c.getByRole('button', { name: /^Flawed/ }).first().click();
    await c.getByPlaceholder('Your bet').fill('10');
    await c.getByRole('textbox', { name: /Rewrite the sentence/ }).fill(fix);
  }
  await clickButton(page, /^Reveal the answer/);
  const list = page.getByTestId('fixit-corrections');
  await expect(list).toContainText(fixes.Ana);
  await expect(list).toContainText(fixes.Bruno);
  await expect(list).not.toContainText('Ana');
  await expect(list).not.toContainText('Bruno');
});
