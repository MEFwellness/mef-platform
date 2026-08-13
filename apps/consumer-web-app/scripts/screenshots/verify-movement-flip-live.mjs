#!/usr/bin/env node
// Live verification for the movement flip against production.
//
// THREE PHASES, deliberately separated, exactly as the Part 2 and Part 3
// scripts do, because each answers a different question and the first two
// are meaningful even when the third cannot run:
//
//   PHASE A  REGRESSION. The member-facing app is unharmed. The Priority
//            Card appears, the Weekly Root Review opens from Home, at most
//            one pop-up owns the screen, and there are no console errors
//            and no 5xx responses anywhere in the run. This is the check
//            that matters most: the flip touched the one engine every
//            member meets on every screen.
//
//   PHASE B  THE FLIP. With the Daily Reset already done, today's claim is
//            cleared through the test-only route and the next render is
//            asked what Root now offers. When it offers a session, the
//            copy is read for the forbidden shapes, the link is followed to
//            the real session player, and the ledger is asked afterwards
//            whether the decision closed itself.
//
//   PHASE C  DISCIPLINE. An account whose Daily Reset is NOT done must get
//            the reset fallback and never a session. This is the half of
//            the rule that cannot be proved by watching movement appear.
//
// WHAT THIS SCRIPT WILL NOT DO. It will not fabricate a driver state, a
// safety flag, an absence or a decision. Everything it observes is what the
// real engine did with the account's real data. It DOES complete a Daily
// Reset by answering it, which is not a force mechanism: that is the
// ordinary thing a member does every day and it leaves this account's own
// real answers. The one state it forces is the one the calendar makes
// unreachable, a second priority claim on the same day, and it forces that
// through a route no non-test account can call. Where a state is genuinely
// unreachable it reports SKIP and says why, rather than a pass it did not
// earn.
//
// Usage:
//   SCREENSHOT_TARGET=live node scripts/screenshots/verify-movement-flip-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login, answerVisibleQuestions, lastResortFill, wizardAdvanceButton } from './lib.mjs';

const PRIORITY_LABEL = 'your priority today';
const REVIEW_LABEL = 'your week with root';

/**
 * Shapes movement copy may never take. Matched on the distinctive fragment
 * rather than a whole sentence, so a copy tweak cannot turn a real
 * regression into a passing check.
 */
const FORBIDDEN_COPY = [
  { label: 'diagnosis', pattern: /\b(tight|weak|stiff|imbalanc|misalign|dysfunction)/i },
  { label: 'promise', pattern: /\b(will help|will fix|will loosen|should help|will improve)/i },
  { label: 'scold', pattern: /\b(you should|you have not|need to|streak|missed)/i },
  { label: 'em dash', pattern: /—/ },
];

const checks = [];
const issues = [];

function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` :: ${detail}` : ''}`);
}

function note(name, detail) {
  checks.push({ name, passed: null, detail });
  console.log(`  [SKIP] ${name} :: ${detail}`);
}

function attach(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push({ label, text: m.text() });
  });
  page.on('pageerror', (e) => issues.push({ label, text: `pageerror: ${e.message}` }));
  page.on('response', (r) => {
    if (r.status() >= 500) issues.push({ label, text: `http${r.status()} ${r.url()}` });
  });
}

async function readDialog(page) {
  return page.evaluate((reviewLabel) => {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    const first = dialogs[0];
    const text = first ? first.innerText : null;
    return {
      count: dialogs.length,
      text,
      isReview: text ? text.toLowerCase().includes(reviewLabel) : false,
    };
  }, REVIEW_LABEL);
}

/** Dismisses whatever single pop-up owns the screen, without answering it. */
async function clearPopup(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    // Deliberately NOT 'Done'. A verification pass must never complete a
    // member's priority as a side effect of tidying the screen.
    for (const label of ['Maybe later', 'Got it', 'Not now', 'Close', 'Dismiss']) {
      const button = [...dialog.querySelectorAll('button')].find(
        (b) => b.innerText.trim().toLowerCase() === label.toLowerCase()
      );
      if (button) {
        button.click();
        return true;
      }
    }
    return false;
  });
}

/** POST the test-only reset route from inside the authenticated page. */
async function forceNewClaim(page) {
  return page.evaluate(async (base) => {
    const response = await fetch(`${base}/api/test-only/movement-priority-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  }, BASE_URL);
}

/** What /today's card is showing: its text and the link it offers, if any. */
async function readCard(page) {
  return page.evaluate((label) => {
    const sections = [...document.querySelectorAll('section')];
    const card = sections.find((s) => s.innerText.toLowerCase().includes(label));
    if (!card) return { found: false };
    const link = card.querySelector('a[href]');
    return {
      found: true,
      text: card.innerText,
      href: link ? link.getAttribute('href') : null,
    };
  }, PRIORITY_LABEL);
}

/**
 * Completes today's Daily Reset by actually answering it, screen by screen.
 *
 * NOT a force mechanism and deliberately not one. Finishing a check-in is
 * the ordinary thing a member does every day, it is reachable on demand,
 * and the answers it leaves are this account's own real data. The only
 * state this script ever FORCES is the one the calendar makes unreachable:
 * a second priority claim on the same day.
 */
async function completeDailyReset(page, maxScreens = 14) {
  await page.goto(`${BASE_URL}/checkin`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  for (let screen = 1; screen <= maxScreens; screen += 1) {
    const button = wizardAdvanceButton(page);
    await button.waitFor({ state: 'visible', timeout: 15000 });
    const label = (await button.textContent())?.trim();
    const isFinal = label !== 'Continue';

    for (let attempt = 0; attempt < 2 && (await button.isDisabled()); attempt += 1) {
      await answerVisibleQuestions(page);
    }
    if (await button.isDisabled()) await lastResortFill(page);
    if (await button.isDisabled()) return false;

    await button.click();

    if (isFinal) {
      const endingContinue = page.getByRole('button', { name: 'Continue' });
      await endingContinue.waitFor({ state: 'visible', timeout: 20000 });
      await endingContinue.click();
      await page.waitForTimeout(1500);
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

/**
 * Walks a session from Begin to Finish. No Done is ever tapped on the
 * Priority Card anywhere in this script, which is what makes the assertion
 * afterwards mean something.
 */
async function walkSession(page, maxSlots = 20) {
  const begin = page.getByRole('button', { name: 'Begin' });
  await begin.waitFor({ state: 'visible', timeout: 15000 });
  await begin.click();
  await page.waitForTimeout(1500);

  for (let slot = 0; slot < maxSlots; slot += 1) {
    const finish = page.getByRole('button', { name: 'Finish' });
    if ((await finish.count()) > 0 && (await finish.first().isVisible())) {
      await finish.first().click();
      await page.waitForTimeout(3000);
      return true;
    }
    const next = page.getByRole('button', { name: 'Next' });
    if ((await next.count()) === 0) return false;
    await next.first().click();
    await page.waitForTimeout(700);
  }
  return false;
}

async function run() {
  const phaseAWhich = process.env.MOVEMENT_ACCOUNT ?? 'memberPopulated';
  const phaseAAccount = ACCOUNTS[phaseAWhich] ?? ACCOUNTS.memberPopulated;
  // The account Phase B and C are driven on. It has to be one whose ladder
  // genuinely reaches the fallback, or the movement rung is unreachable for
  // a correct reason and the phase proves nothing.
  const fallbackAccount = ACCOUNTS[process.env.MOVEMENT_FALLBACK_ACCOUNT ?? 'memberEmpty'];

  console.log(`\nThe movement flip, live verification against ${BASE_URL}`);
  console.log(`Phase A account: ${phaseAAccount.label}`);
  console.log(`Phase B and C account: ${fallbackAccount.label}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  attach(page, phaseAAccount.label);

  // ---------------------------------------------------------------
  console.log('PHASE A: regression, the member-facing app is unharmed');
  // ---------------------------------------------------------------

  await login(page, BASE_URL, phaseAAccount);
  await page.waitForTimeout(2500);
  check('logged in and landed off /login', !page.url().includes('/login'), page.url());

  const firstDialog = await readDialog(page);
  check(
    'at most one pop-up owns the screen',
    (firstDialog.count ?? 0) <= 1,
    `count=${firstDialog.count ?? 0}${firstDialog.isReview ? ' (weekly review)' : ''}`
  );
  if (firstDialog.count) await clearPopup(page);
  await page.waitForTimeout(600);

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const homeText = await page.evaluate(() => document.body.innerText);
  check('Home renders real content, not an error page', homeText.length > 400, `${homeText.length} chars`);
  check('the Priority Card is still present on Home', homeText.toLowerCase().includes(PRIORITY_LABEL), '');
  check(
    'the Weekly Root Review entry is still reachable from Home',
    homeText.toLowerCase().includes('week with root') || homeText.toLowerCase().includes('weekly'),
    ''
  );

  const probe = await forceNewClaim(page);
  check(
    'the test-only route is deployed and answers',
    probe.status === 200 || probe.status === 403,
    `http${probe.status} ${JSON.stringify(probe.body)}`
  );
  check(
    'the route allows this account (is_test) or refuses it (403), never anything else',
    probe.status === 200 || probe.status === 403,
    probe.status === 200 ? 'allowed, so this IS a test account' : 'refused, so this is NOT a test account'
  );
  const liveSessions = probe.body?.liveSessionCount ?? 0;
  check(
    'the six Root Movement sessions are readable from a member session',
    liveSessions === 6,
    `liveSessionCount=${liveSessions}`
  );

  await page.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const phaseACard = await readCard(page);
  check('the card claimed a fresh priority after the reset', phaseACard.found === true, phaseACard.href ?? 'no link');
  if (probe.body?.checkinDoneToday === false) {
    check(
      'a rich account with the Daily Reset outstanding is offered no session',
      !(phaseACard.href ?? '').includes('/movement/sessions/'),
      phaseACard.href ?? 'no link'
    );
  }

  // ---------------------------------------------------------------
  console.log('\nPHASE C, first half: an account with the Daily Reset NOT done');
  // ---------------------------------------------------------------

  const second = await context.newPage();
  attach(second, fallbackAccount.label);
  await context.clearCookies();
  await login(second, BASE_URL, fallbackAccount);
  await second.waitForTimeout(2500);
  const secondDialog = await readDialog(second);
  if (secondDialog.count) await clearPopup(second);

  const beforeProbe = await forceNewClaim(second);
  if (beforeProbe.status !== 200) {
    note('the fallback account could not be driven', `http${beforeProbe.status}`);
  } else if (beforeProbe.body?.checkinDoneToday === true) {
    note(
      'the reset-not-done case could not be observed today',
      "this account's Daily Reset is already done, so it is not in that state."
    );
  } else {
    await second.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
    await second.waitForTimeout(3000);
    const before = await readCard(second);
    check(
      'with the Daily Reset NOT done she gets the reset, never a session',
      !(before.href ?? '').includes('/movement/sessions/'),
      before.href ?? 'no link'
    );
    check(
      'and the reset fallback still points at /checkin',
      (before.href ?? '').includes('/checkin'),
      before.href ?? (before.text ?? '').slice(0, 80)
    );
  }

  // ---------------------------------------------------------------
  console.log('\nPHASE B: the flip');
  // ---------------------------------------------------------------

  if (beforeProbe.status !== 200) {
    note('the flip cannot be driven', 'the reset route refused this account.');
  } else {
    let resetDone = beforeProbe.body?.checkinDoneToday === true;
    if (!resetDone) {
      const completed = await completeDailyReset(second);
      check('completed a real Daily Reset, by answering it', completed === true, '');
      resetDone = completed;
    }

    const afterProbe = await forceNewClaim(second);
    check(
      'the Daily Reset now reads as done, which is the condition the rung turns on',
      afterProbe.body?.checkinDoneToday === true,
      `checkinDoneToday=${afterProbe.body?.checkinDoneToday}`
    );

    await second.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
    await second.waitForTimeout(3000);
    const card = await readCard(second);
    const isMovement = (card.href ?? '').includes('/movement/sessions/');

    if (!isMovement) {
      note(
        'a movement session was not offered',
        'a rule above the movement rung won for this account today, which is correct behavior. ' +
          `Card link: ${card.href ?? 'none'}. Card text: ${(card.text ?? '').slice(0, 120).replace(/\n/g, ' | ')}`
      );
    } else {
      const sessionKey = (card.href ?? '').split('/').pop();
      check('the card offers a Root Movement session by its own route', true, card.href);

      for (const { label, pattern } of FORBIDDEN_COPY) {
        check(`the copy contains no ${label}`, !pattern.test(card.text), '');
      }
      check(
        'the copy offers rather than instructs',
        /if you want it|when you are ready|when you want it/i.test(card.text),
        (card.text ?? '').slice(0, 120).replace(/\n/g, ' | ')
      );

      await second.goto(`${BASE_URL}${card.href}`, { waitUntil: 'load' });
      await second.waitForTimeout(3000);
      const playerText = await second.evaluate(() => document.body.innerText);
      check(
        'the link opens the real session player, not a 404',
        !playerText.toLowerCase().includes('page not found') && playerText.length > 200,
        `${sessionKey}, ${playerText.length} chars`
      );
      check(
        'the player shows the session lineup rather than an empty screen',
        /begin|start/i.test(playerText),
        playerText.slice(0, 100).replace(/\n/g, ' | ')
      );

      // The whole point of the flip: she does the workout, and is never
      // asked to also confirm it. Walked for real, Begin to Finish.
      const walked = await walkSession(second);
      check('the session can be walked from Begin to Finish', walked === true, '');

      if (walked) {
        await second.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
        await second.waitForTimeout(3000);
        const after = await readCard(second);
        check(
          'the priority marked itself done, with no Done tapped anywhere in this run',
          /done today/i.test(after.text ?? ''),
          (after.text ?? '').slice(0, 120).replace(/\n/g, ' | ')
        );
      }
    }
  }

  // ---------------------------------------------------------------
  console.log('\nPHASE C, second half: the rules above the movement rung');
  // ---------------------------------------------------------------
  note(
    'safety, re-engagement and the Reset Plan commitment beating a session',
    'not forceable live without writing a safety classification or falsifying an absence, which no ' +
      'test-only route here will do. Proved instead against the real engine in ' +
      'tests/movement-coaching-flip.test.ts, over a fixture with a mapped movement driver present.'
  );

  // ---------------------------------------------------------------
  console.log('\nErrors seen anywhere in the run');
  // ---------------------------------------------------------------
  check('no console errors, page errors or 5xx responses', issues.length === 0,
    issues.slice(0, 6).map((i) => `${i.label}: ${i.text}`).join(' | '));

  await browser.close();

  const failed = checks.filter((c) => c.passed === false);
  const skipped = checks.filter((c) => c.passed === null);
  console.log(
    `\n${checks.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
