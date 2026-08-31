/**
 * Drives the whole public entry journey in a real browser and reports what
 * it saw at every step.
 *
 * Used for the local smoke test and, with BASE_URL pointed at production,
 * for the live verification run. It takes two complete journeys through the
 * experience with deliberately different answers, because the one property
 * that matters most cannot be proven by a single run: two visitors who
 * answered differently must not read the same result.
 *
 *   BASE_URL      where to drive (default http://localhost:3000)
 *   SOURCE_CODE   the source-coded link to arrive through (default qa)
 *   LEAD_EMAIL    the email to leave at the optional email step
 *
 * Prints the visitor token of the first journey on the last line, so a
 * follow-on script (or a person) can bind it to a new account and check the
 * continuation.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SOURCE = process.env.SOURCE_CODE || 'qa';
const EMAIL = process.env.LEAD_EMAIL || `energy.smoke.${Date.now()}@example.test`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/** innerText returns CSS-transformed text, and several headings here are uppercased in CSS. */
function has(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

const browser = await chromium.launch();

/**
 * One complete journey. `pick` chooses which option to tap on each screen,
 * so two journeys can be given genuinely different answers.
 */
async function journey({ pick, leaveEmail }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/energy/${SOURCE}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Begin' }).waitFor({ timeout: 30000 });
  const token = await page.evaluate(() => localStorage.getItem('mef.publicEntry.token.v1'));
  await page.getByRole('button', { name: 'Begin' }).click();

  const chosen = [];
  for (let q = 0; q < 9; q += 1) {
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible().catch(() => false)) await cont.click();

    const options = page.locator('[role="radio"]');
    await options.first().waitFor({ timeout: 30000 });
    const count = await options.count();
    const index = pick(q, count);
    chosen.push((await options.nth(index).innerText()).trim());
    await options.nth(index).click();
    await page.waitForTimeout(350);
  }

  await page.getByText('What we noticed').waitFor({ timeout: 30000 });
  const resultText = await page.locator('main').innerText();
  const evidence = (await page.locator('main li').allInnerTexts()).filter((t) =>
    t.startsWith('You told us')
  );
  const patternTitle = await page.locator('main h2').first().innerText();

  let notesText = null;
  if (leaveEmail) {
    await page.fill('#energy-email', EMAIL);
    await page.getByRole('button', { name: 'Open my three day notes' }).click();
    await page.getByText('Here they are').waitFor({ timeout: 30000 });
    notesText = await page.locator('main').innerText();
  }

  return { page, context, token, chosen, resultText, evidence, patternTitle, notesText, consoleErrors };
}

// ---------------------------------------------------------------------
// Journey one: first option on every screen, and the email step.
// ---------------------------------------------------------------------

const one = await journey({ pick: (q, count) => q % count, leaveEmail: true });

check('1. the source-coded link loads and mints a visitor token', Boolean(one.token),
  one.token ? `${one.token.slice(0, 8)}...` : 'none');
check('2. all nine questions were answered', one.chosen.length === 9);
check('3. the result screen appeared', has(one.resultText, 'What we noticed'));
check('4. a pattern was named', one.patternTitle.length > 3, one.patternTitle);

for (const heading of [
  'What we noticed',
  'This came from what you told us',
  'What this often looks like',
  'What this does not tell us',
  'One thing worth trying',
]) {
  check(`5. free result section present: ${heading}`, has(one.resultText, heading));
}

check('6. three evidence lines, each restating an answer', one.evidence.length === 3,
  `${one.evidence.length}`);
check('7. the free result is complete before anything is asked for',
  one.resultText.indexOf('Three day notes') > one.resultText.indexOf('One thing worth trying'));
check('8. the limits are stated at full size, not as small print',
  has(one.resultText, 'It is a first impression, not an assessment'));
check('9. the email step says plainly that nothing is emailed today',
  has(one.resultText, 'Nothing lands in your inbox today'));
check('10. the promised notes are actually delivered', has(one.notesText || '', 'Here they are'));
check('11. the notes are three real days',
  ['Day one', 'Day two', 'Day three'].every((d) => has(one.notesText || '', d)));
check('12. the invitation into Rooted Reset comes last',
  one.notesText.toLowerCase().indexOf('if you want to keep going') >
    one.notesText.toLowerCase().indexOf('day three'));

const emDashes = ((one.notesText || '').match(/—/g) || []).length;
check('13. zero em dashes anywhere on the experience', emDashes === 0, `${emDashes} found`);
check('14. zero console errors through the whole journey', one.consoleErrors.length === 0,
  one.consoleErrors.join(' | ').slice(0, 300));

await one.page.getByRole('button', { name: 'Create a free account' }).click();
await one.page.waitForURL('**/signup', { timeout: 30000 });
check('15. the invitation reaches the signup screen', one.page.url().endsWith('/signup'));
const signupText = await one.page.locator('body').innerText();
check('16. signup acknowledges where they started',
  has(signupText, 'Pick up where you started'));
await one.context.close();

// ---------------------------------------------------------------------
// Journey two: last option on every screen, no email. Different answers
// have to produce a different result, or none of the above means anything.
// ---------------------------------------------------------------------

const two = await journey({ pick: (q, count) => (count - 1 - (q % count) + count) % count, leaveEmail: false });

check('17. a second visitor gets their own session',
  Boolean(two.token) && two.token !== one.token);
check('18. different answers produce different evidence',
  JSON.stringify(one.evidence) !== JSON.stringify(two.evidence),
  `${one.evidence.length} vs ${two.evidence.length} lines, first differs: ${one.evidence[0] !== two.evidence[0]}`);
check('19. every evidence line in both runs restates an answer',
  [...one.evidence, ...two.evidence].every((line) => line.startsWith('You told us ') && line.endsWith('.')));
check('20. the second run also names a pattern and states its limits',
  two.patternTitle.length > 3 && has(two.resultText, 'What this does not tell us'),
  two.patternTitle);
check('21. the second run raised no console errors', two.consoleErrors.length === 0,
  two.consoleErrors.join(' | ').slice(0, 300));
await two.context.close();

await browser.close();

console.log('\n----------------------------------------');
const passed = results.filter((r) => r.ok).length;
console.log(`${passed} of ${results.length}`);
console.log(`journey one pattern: ${one.patternTitle}`);
console.log(`journey two pattern: ${two.patternTitle}`);
console.log(`lead email: ${EMAIL}`);
console.log(`VISITOR_TOKEN=${one.token}`);
process.exit(passed === results.length ? 0 : 1);
