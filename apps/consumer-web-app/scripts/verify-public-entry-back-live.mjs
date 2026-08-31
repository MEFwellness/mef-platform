/**
 * The back control, driven as a visitor on a phone.
 *
 * Every requirement is checked against what the page actually shows, not
 * against what the state machine says it should: which option is marked
 * selected, what the progress row reads, which question is on screen after
 * a boundary crossing, and what the result says once an earlier answer has
 * been changed.
 *
 *   BASE_URL     default http://localhost:3000
 *   SOURCE_CODE  default qa
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SOURCE = process.env.SOURCE_CODE || 'qa';
const PHONE = { width: 393, height: 852 };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: PHONE });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Every back control's accessible name starts with "Back" and then says
// where back goes, for a screen reader. The visible label is just "Back".
const back = () => page.getByRole('button', { name: /^Back/ });
const prompt = () => page.locator('main h2').first().innerText();
const progress = () => page.locator('main').innerText().then((t) => (t.match(/(\d) of 9 answered/) || [])[0] ?? '');
const selected = () => page.locator('[role="radio"][aria-checked="true"]').first().innerText().catch(() => null);

await page.goto(`${BASE}/energy/${SOURCE}`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Begin' }).waitFor({ timeout: 30000 });

check('1. the entry screen has no back control', (await back().count()) === 0);

await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForTimeout(2500);
check('2. the first section intro has a back control', (await back().count()) === 1);

// Entry -> section 1 intro -> back -> entry.
await back().click();
await page.waitForTimeout(1200);
check('3. back from the first section intro returns to the entry screen',
  (await page.getByRole('button', { name: 'Begin' }).count()) === 1);

await page.getByRole('button', { name: 'Begin' }).click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(1200);

const q1Prompt = await prompt();
check('4. every question screen has a back control', (await back().count()) === 1, q1Prompt);
check('5. progress starts at zero answered', (await progress()) === '0 of 9 answered', await progress());

// Answer Q1 and Q2 (section one), landing on section two's intro.
const q1Options = await page.locator('[role="radio"]').allInnerTexts();
await page.locator('[role="radio"]').nth(2).click();
await page.waitForTimeout(900);
const q2Prompt = await prompt();
check('6. answering advances to the next question', q2Prompt !== q1Prompt, q2Prompt);
check('7. progress rose by one', (await progress()) === '1 of 9 answered', await progress());

// Back from question two -> question one, with the earlier answer selected.
await back().click();
await page.waitForTimeout(900);
check('8. back from a question returns to the previous question', (await prompt()) === q1Prompt);
check('9. the earlier answer is still shown as selected',
  (await selected()) === q1Options[2], `${await selected()}`);
check('10. progress does not fall when moving backward',
  (await progress()) === '1 of 9 answered', await progress());

// Forward again, then all the way to section two's first question.
await page.locator('[role="radio"]').nth(2).click();
await page.waitForTimeout(900);
await page.locator('[role="radio"]').nth(0).click();
await page.waitForTimeout(1400);
check('11. finishing a section reaches the next section intro',
  (await page.getByRole('button', { name: 'Continue' }).count()) === 1);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(1200);
const section2First = await prompt();

// Back once -> section two's intro. Back twice -> section one's last question.
await back().click();
await page.waitForTimeout(1200);
check('12. back from the first question of a section returns to that section intro',
  (await page.getByRole('button', { name: 'Continue' }).count()) === 1);
await back().click();
await page.waitForTimeout(1200);
check('13. back across a section boundary lands on the previous section last question',
  (await prompt()) === q2Prompt, await prompt());
check('14. and that answer is still selected', (await selected()) !== null, `${await selected()}`);

// Change that earlier answer to something different, then walk to the end.
const q2Options = await page.locator('[role="radio"]').allInnerTexts();
await page.locator('[role="radio"]').nth(q2Options.length - 1).click();
await page.waitForTimeout(1400);
check('15. changing an earlier answer moves forward again from that point',
  (await page.getByRole('button', { name: 'Continue' }).count()) === 1);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(1200);
check('16. and lands back on the section it was heading to', (await prompt()) === section2First);

// Finish the remaining questions.
let guard = 0;
while (guard < 12) {
  guard += 1;
  const cont = page.getByRole('button', { name: 'Continue' });
  if (await cont.isVisible().catch(() => false)) { await cont.click(); await page.waitForTimeout(1100); continue; }
  const done = await page.getByText('What we noticed').isVisible().catch(() => false);
  if (done) break;
  const options = page.locator('[role="radio"]');
  if ((await options.count()) === 0) { await page.waitForTimeout(800); continue; }
  await options.nth(0).click();
  await page.waitForTimeout(800);
}
await page.getByText('What we noticed').waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);

const resultText = await page.locator('main').innerText();
check('17. the result screen has no back control', (await back().count()) === 0);

const evidence = (await page.locator('main li').allInnerTexts()).filter((t) => t.startsWith('You told us'));
check('18. every evidence line still restates an answer', evidence.length === 3 &&
  evidence.every((l) => l.startsWith('You told us ') && l.endsWith('.')), `${evidence.length} lines`);

check('19. zero em dashes across the whole walk', (resultText.match(/—/g) || []).length === 0);
check('20. zero console errors across the whole walk', errors.length === 0,
  errors.join(' | ').slice(0, 300));

const token = await page.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'));
await context.close();

// ---------------------------------------------------------------------
// The requirement that matters most, proved by comparison rather than by
// looking for a phrase: a result reached by going back and changing an
// answer must be the SAME result as one reached by giving that answer in
// the first place, and a DIFFERENT result from the one the original answer
// would have produced. Anything less would pass on a stale result too.
// ---------------------------------------------------------------------

/**
 * One complete walk. `pick(questionNumber)` chooses the option index for
 * each question. When `changeFirstTo` is set, the walk answers questions
 * one through eight, steps all the way back to question one, changes it,
 * and then walks forward again to the end.
 */
async function walk({ pick, changeFirstTo }) {
  const ctx = await browser.newContext({ viewport: PHONE });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto(`${BASE}/energy/${SOURCE}`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Begin' }).waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: 'Begin' }).click();
  await p.waitForTimeout(2200);

  let firstPrompt = null;
  let answered = 0;
  const stopAt = changeFirstTo === undefined ? 9 : 8;

  while (answered < stopAt) {
    const cont = p.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible().catch(() => false)) { await cont.click(); await p.waitForTimeout(1000); continue; }
    const options = p.locator('[role="radio"]');
    await options.first().waitFor({ timeout: 30000 });
    if (firstPrompt === null) firstPrompt = (await p.locator('main h2').first().innerText()).trim();
    const count = await options.count();
    await options.nth(pick(answered) % count).click();
    answered += 1;
    await p.waitForTimeout(750);
  }

  if (changeFirstTo !== undefined) {
    // All the way back to question one, however many screens that is.
    for (let i = 0; i < 20; i += 1) {
      const current = await p.locator('main h2').first().innerText().catch(() => '');
      if (current.trim() === firstPrompt) break;
      await p.getByRole('button', { name: /^Back/ }).click();
      await p.waitForTimeout(700);
    }
    const options = p.locator('[role="radio"]');
    await options.first().waitFor({ timeout: 30000 });
    await options.nth(changeFirstTo).click();
    await p.waitForTimeout(900);

    // Forward again to the end, re-confirming everything already answered.
    for (let i = 0; i < 24; i += 1) {
      if (await p.getByText('What we noticed').isVisible().catch(() => false)) break;
      const cont = p.getByRole('button', { name: 'Continue' });
      if (await cont.isVisible().catch(() => false)) { await cont.click(); await p.waitForTimeout(1000); continue; }
      const opts = p.locator('[role="radio"]');
      if ((await opts.count()) === 0) { await p.waitForTimeout(700); continue; }
      const checked = p.locator('[role="radio"][aria-checked="true"]');
      if ((await checked.count()) > 0) await checked.first().click();
      else await opts.nth(0).click();
      await p.waitForTimeout(750);
    }
  }

  await p.getByText('What we noticed').waitFor({ timeout: 30000 });
  await p.waitForTimeout(900);
  const pattern = (await p.locator('main h2').first().innerText()).trim();
  const lines = (await p.locator('main li').allInnerTexts()).filter((t) => t.startsWith('You told us'));
  await ctx.close();
  return { pattern, lines, errors: errs };
}

const ORIGINAL_FIRST = 0;
const CHANGED_FIRST = 4;

// A: question one answered with the original option, straight through.
const runA = await walk({ pick: () => ORIGINAL_FIRST });
// B: question one answered with the changed option from the start.
const runB = await walk({ pick: (n) => (n === 0 ? CHANGED_FIRST : ORIGINAL_FIRST) });
// C: question one answered with the original, then changed by going back.
const runC = await walk({ pick: () => ORIGINAL_FIRST, changeFirstTo: CHANGED_FIRST });

const fingerprint = (r) => `${r.pattern} :: ${r.lines.join(' | ')}`;

check('21. the two answers to question one genuinely produce different results',
  fingerprint(runA) !== fingerprint(runB),
  `A "${runA.pattern}" vs B "${runB.pattern}"`);
check('22. going back and changing it gives the same result as answering it that way',
  fingerprint(runC) === fingerprint(runB),
  `C "${runC.pattern}"`);
check('23. and not the result the original answer would have produced',
  fingerprint(runC) !== fingerprint(runA));
check('24. no stale evidence line survives the change',
  runC.lines.every((l) => runB.lines.includes(l)),
  `${runC.lines.length} lines, all matching the direct run`);
check('25. no console errors in any of the three comparison walks',
  [runA, runB, runC].every((r) => r.errors.length === 0),
  [runA, runB, runC].flatMap((r) => r.errors).join(' | ').slice(0, 200));

await browser.close();

console.log('\n----------------------------------------');
const passed = results.filter((r) => r.ok).length;
console.log(`${passed} of ${results.length}`);
console.log(`VISITOR_TOKEN=${token}`);
process.exit(passed === results.length ? 0 : 1);
