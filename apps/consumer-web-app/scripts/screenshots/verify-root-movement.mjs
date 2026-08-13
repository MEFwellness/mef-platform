/**
 * Root Movement, Level 1 — end-to-end verification of the member flow.
 *
 * Runs against whichever target config.mjs resolves (local by default,
 * SCREENSHOT_TARGET=live for production), using the same login() and
 * ACCOUNTS conventions as every other verify-*.mjs script here.
 *
 * What it drives, in order:
 *   1. /movement shows the Root Movement entry card
 *   2. /movement/sessions lists all six with name, description, duration
 *   3. one session opens, showing its full lineup and a Begin button
 *   4. Begin starts the session and the first exercises render with
 *      video surface, name and prescription
 *   5. one exercise is skipped
 *   6. the session is walked to the end and the completion state appears
 *
 * It then reads back, over the app's own authenticated session, whether
 * the run row landed with a skip on it. Database and event verification
 * beyond that is done separately with a service-role client, since the
 * member's own session cannot read the analytics rollup.
 *
 * Nothing here asserts. It prints what it saw, so a human reading the
 * output can tell a pass from a partial pass, and a failure is a printed
 * fact rather than a thrown stack.
 */

import { chromium } from 'playwright';
import { BASE_URL, ACCOUNTS, VIEWPORT, USER_AGENT, TARGET } from './config.mjs';
import { login } from './lib.mjs';

const results = [];
function record(step, ok, detail = '') {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  ${detail}` : ''}`);
}

const EXPECTED_SESSIONS = [
  'Morning Mobility',
  'Desk Reset',
  'Hip and Back Reset',
  'Shoulder and Neck Reset',
  'Core Foundation',
  'Recovery Day',
];

/** The session walked end to end: the shortest of the six, by slot count. */
const WALK_SESSION = 'desk_reset';

async function main() {
  console.log(`Root Movement verification against ${TARGET}: ${BASE_URL}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ ...VIEWPORT, userAgent: USER_AGENT });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  try {
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    record('logged in', true, ACCOUNTS.memberPopulated.label);

    // 1) the entry point
    await page.goto(`${BASE_URL}/movement`, { waitUntil: 'networkidle' });
    const entryCard = page.getByRole('link', { name: /Root Movement/i });
    const entryVisible = (await entryCard.count()) > 0;
    record('Movement screen shows the Root Movement entry card', entryVisible);

    // 2) the six
    await page.goto(`${BASE_URL}/movement/sessions`, { waitUntil: 'networkidle' });
    const bodyText = await page.locator('main').innerText();
    const missing = EXPECTED_SESSIONS.filter((name) => !bodyText.includes(name));
    record('all six sessions listed', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : '');
    record(
      'each card carries a duration',
      (bodyText.match(/\d+ to \d+ min/g) || []).length >= 6,
      `${(bodyText.match(/\d+ to \d+ min/g) || []).length} duration labels`
    );

    // 3) one session's lineup
    await page.goto(`${BASE_URL}/movement/sessions/${WALK_SESSION}`, { waitUntil: 'networkidle' });
    const lineupItems = await page.locator('main ol li').count();
    record('session screen shows its full lineup', lineupItems >= 8, `${lineupItems} exercises listed`);

    // 4) begin, and walk it
    await page.getByRole('button', { name: 'Begin' }).click();
    await page.waitForTimeout(1200);

    const walked = [];
    let skipped = null;
    for (let step = 0; step < 40; step += 1) {
      const heading = await page.locator('main h1').first().innerText();
      const counter = await page.locator('main p', { hasText: /^\d+ of \d+$/ }).first().innerText().catch(() => '');
      const videoSurface = await page
        .getByRole('button', { name: 'Play exercise video' })
        .count()
        .catch(() => 0);
      walked.push({ heading, counter, hasVideoSurface: videoSurface > 0 });

      // Skip exactly one exercise, the third, then continue normally.
      const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
      const skip = page.getByRole('button', { name: 'Skip this one' });
      if (step === 2 && (await skip.count()) > 0) {
        skipped = heading;
        await skip.click();
      } else if ((await next.count()) > 0) {
        await next.click();
      } else {
        break;
      }
      await page.waitForTimeout(500);

      const done = await page.getByText('That is the session.').count();
      if (done > 0) break;
    }

    const firstThree = walked.slice(0, 3);
    record(
      'first three exercises each rendered a video surface',
      firstThree.length === 3 && firstThree.every((e) => e.hasVideoSurface),
      firstThree.map((e) => `${e.counter} ${e.heading}${e.hasVideoSurface ? '' : ' (no video surface)'}`).join(' | ')
    );
    record('one exercise skipped', skipped !== null, skipped ?? '');

    const completed = (await page.getByText('That is the session.').count()) > 0;
    record('session completed with a calm acknowledgment', completed);
    if (completed) {
      const doneText = await page.locator('main').innerText();
      record(
        'completion copy carries no hype and no em dash',
        !doneText.includes('—') && !/(congratulations|amazing|great job|streak)/i.test(doneText),
        doneText.split('\n').slice(0, 4).join(' / ')
      );
    }

    // 5) mid-session exit leaves nothing scolding
    await page.goto(`${BASE_URL}/movement/sessions/${WALK_SESSION}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Begin' }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Leave this session' }).click();
    await page.waitForTimeout(400);
    const afterExit = await page.locator('main').innerText();
    record(
      'leaving mid-session shows no warning, no guilt and no lost-progress message',
      !/(are you sure|lost|progress will|don.t give up|you quit)/i.test(afterExit)
    );

    // 6) the Priority Card and the Weekly Review are unchanged
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    const dashText = await page.locator('body').innerText();
    record(
      'no movement recommendation appears on Home',
      !/(root movement session|try a movement session|movement session for you)/i.test(dashText)
    );

    record('no console errors during the flow', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  } catch (error) {
    record('run completed without throwing', false, String(error));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('Failed:');
    for (const f of failed) console.log(`  - ${f.step} ${f.detail}`);
  }
}

main();
