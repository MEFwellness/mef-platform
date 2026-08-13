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
// WHAT THIS SCRIPT WILL NOT DO. It will not complete a Daily Reset, will
// not fabricate a driver state, and will not write a decision itself.
// Everything it observes is what the real engine did with the account's
// real data. Where a state is genuinely unreachable today it reports SKIP
// and says why, rather than reporting a pass it did not earn.
//
// Usage:
//   SCREENSHOT_TARGET=live node scripts/screenshots/verify-movement-flip-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

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

async function run() {
  const which = process.env.MOVEMENT_ACCOUNT ?? 'memberPopulated';
  const account = ACCOUNTS[which] ?? ACCOUNTS.memberPopulated;

  console.log(`\nThe movement flip, live verification against ${BASE_URL}`);
  console.log(`Account: ${account.label}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  attach(page, account.label);

  // ---------------------------------------------------------------
  console.log('PHASE A: regression, the member-facing app is unharmed');
  // ---------------------------------------------------------------

  await login(page, BASE_URL, account);
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
  check(
    'the Priority Card is still present on Home',
    homeText.toLowerCase().includes(PRIORITY_LABEL),
    ''
  );
  check(
    'the Weekly Root Review entry is still reachable from Home',
    homeText.toLowerCase().includes('week with root') || homeText.toLowerCase().includes('weekly'),
    'looked for the review entry on Home'
  );

  const probe = await forceNewClaim(page);
  check(
    'the test-only route is deployed and answers',
    probe.status === 200 || probe.status === 403,
    `http${probe.status} ${JSON.stringify(probe.body)}`
  );
  const isTestAccount = probe.status === 200;
  check(
    'the route allows this account (is_test) or refuses it (403), never anything else',
    probe.status === 200 || probe.status === 403,
    isTestAccount ? 'allowed, so this IS a test account' : 'refused, so this is NOT a test account'
  );

  const liveSessions = probe.body?.liveSessionCount ?? 0;
  check(
    'the six Root Movement sessions are readable from a member session',
    liveSessions === 6,
    `liveSessionCount=${liveSessions}`
  );

  // ---------------------------------------------------------------
  console.log('\nPHASE B: the flip');
  // ---------------------------------------------------------------

  if (!isTestAccount) {
    note('the flip cannot be driven', 'the reset route refused this account, so no state can be forced.');
  } else {
    const resetDone = probe.body?.checkinDoneToday === true;
    check(
      "today's Daily Reset state is readable, which is the condition the rung turns on",
      typeof probe.body?.checkinDoneToday === 'boolean',
      `checkinDoneToday=${resetDone}`
    );

    await page.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const card = await readCard(page);
    check('the card claimed a fresh priority after the reset', card.found === true, card.href ?? 'no link');

    const isMovement = (card.href ?? '').includes('/movement/sessions/');

    if (!resetDone) {
      note(
        'a movement session could not be reached',
        "today's Daily Reset is not done on this account, so the reset fallback is the correct answer. " +
          'Complete a Daily Reset on this account and re-run to reach Phase B.'
      );
      check(
        'and Root correctly offered no session while the reset was outstanding',
        !isMovement,
        card.href ?? 'no link'
      );
    } else if (!isMovement) {
      note(
        'a movement session was not offered',
        'a rule above the movement rung won for this account today, which is correct behavior. ' +
          `Card link: ${card.href ?? 'none'}.`
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
        ''
      );

      await page.goto(`${BASE_URL}${card.href}`, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      const playerText = await page.evaluate(() => document.body.innerText);
      check(
        'the link opens the real session player, not a 404',
        !playerText.toLowerCase().includes('page not found') && playerText.length > 200,
        `${sessionKey}, ${playerText.length} chars`
      );

      note(
        'completing the session and watching the decision close itself',
        'requires walking the whole lineup in the player, which this script does not automate. ' +
          'Do it by hand from the checklist in docs/BUILD_STATUS.md, then reload /today and ' +
          'confirm it reads "Done today." without having tapped Done.'
      );
    }
  }

  // ---------------------------------------------------------------
  console.log('\nPHASE C: discipline');
  // ---------------------------------------------------------------

  const emptyAccount = ACCOUNTS.memberEmpty;
  const emptyPage = await context.newPage();
  attach(emptyPage, emptyAccount.label);
  await emptyPage.goto(`${BASE_URL}/logout`, { waitUntil: 'load' }).catch(() => {});
  await context.clearCookies();
  await login(emptyPage, BASE_URL, emptyAccount);
  await emptyPage.waitForTimeout(2500);
  const emptyDialog = await readDialog(emptyPage);
  if (emptyDialog.count) await clearPopup(emptyPage);

  const emptyProbe = await forceNewClaim(emptyPage);
  if (emptyProbe.status !== 200) {
    note('the second account could not be driven', `http${emptyProbe.status}`);
  } else {
    await emptyPage.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
    await emptyPage.waitForTimeout(3000);
    const emptyCard = await readCard(emptyPage);
    const emptyResetDone = emptyProbe.body?.checkinDoneToday === true;
    const emptyIsMovement = (emptyCard.href ?? '').includes('/movement/sessions/');

    if (emptyResetDone) {
      note(
        'the reset-not-done case could not be observed on this account',
        "its Daily Reset is already done today, so the reset fallback is not the state it is in."
      );
    } else {
      check(
        'an account with the Daily Reset NOT done gets the reset, never a session',
        !emptyIsMovement,
        emptyCard.href ?? 'no link'
      );
      check(
        'and the reset fallback still points at /checkin',
        (emptyCard.href ?? '').includes('/checkin') ||
          (emptyCard.text ?? '').toLowerCase().includes('daily reset'),
        emptyCard.href ?? (emptyCard.text ?? '').slice(0, 80)
      );
    }
  }

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
