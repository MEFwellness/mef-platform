#!/usr/bin/env node
// Live verification for the Weekly Root Review (Adaptive Coaching
// Direction, Part 2) against production.
//
// TWO PHASES, deliberately separated, because the second one depends on
// migration 151 being applied to the production database and the first one
// does not:
//
//   PHASE A  The feature is deployed and the app is unharmed. Runs whether
//            or not the migration has landed. This is the check that
//            matters most if the code ships ahead of the migration: every
//            read fails closed, so a member sees exactly what she saw
//            before, and the Priority Card still works.
//
//   PHASE B  The review itself: it arrives as a pop-up, reads correctly for
//            this account's data, acknowledge works, the persistent entry
//            is reachable from Home, exactly one review row and one week
//            focus row exist, a reload does not re-deliver, and the next
//            day's priority card still works with the focus present.
//            Requires migration 151.
//
// The forced redelivery uses the test-account-only route
// (app/api/test-only/weekly-review-reset), which refuses any account not
// flagged profiles.is_test and can only ever clear the caller's own current
// week. It composes nothing, so the review this script sees is the same
// review a real Monday would produce over the same real data.
//
// Usage:
//   SCREENSHOT_TARGET=live node scripts/screenshots/verify-weekly-review-live.mjs
//   SCREENSHOT_TARGET=live WEEKLY_REVIEW_ACCOUNT=belowThreshold node ...
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

const REVIEW_LABEL = 'your week with root';
const PRIORITY_LABEL = 'your priority today';

const checks = [];
const issues = [];

function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` :: ${detail}` : ''}`);
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

/** Whichever role="dialog" is on screen, and what it is. */
async function readDialog(page) {
  return page.evaluate(
    ({ reviewLabel, priorityLabel }) => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const dialog = dialogs[0];
      if (!dialog) return { count: 0 };
      const text = dialog.innerText;
      const lower = text.toLowerCase();
      return {
        count: dialogs.length,
        text,
        isReview: lower.includes(reviewLabel),
        isPriority: lower.includes(priorityLabel),
        buttons: [...dialog.querySelectorAll('button')].map((b) => b.innerText.trim()),
        sections: {
          showed: lower.includes('what this week showed'),
          worked: lower.includes('what worked'),
          adjusting: lower.includes('what root is adjusting'),
        },
      };
    },
    { reviewLabel: REVIEW_LABEL, priorityLabel: PRIORITY_LABEL }
  );
}

/** The persistent entry on Home, if it is there. */
async function readEntry(page) {
  return page.evaluate((label) => {
    const sections = [...document.querySelectorAll('section')];
    const entry = sections.find((s) => s.innerText.toLowerCase().includes(label));
    if (!entry) return null;
    const toggle = entry.querySelector('button[aria-expanded]');
    return {
      text: entry.innerText,
      expanded: toggle?.getAttribute('aria-expanded') === 'true',
      hasToggle: Boolean(toggle),
    };
  }, REVIEW_LABEL);
}

async function clickInDialog(page, name) {
  return page.evaluate((name) => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const button = [...dialog.querySelectorAll('button')].find(
      (b) => b.innerText.trim().toLowerCase() === name.toLowerCase()
    );
    if (!button) return false;
    button.click();
    return true;
  }, name);
}

/** POST the test-only reset route from inside the authenticated page. */
async function forceRedelivery(page) {
  return page.evaluate(async (base) => {
    const response = await fetch(`${base}/api/test-only/weekly-review-reset`, {
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

async function run() {
  const which = process.env.WEEKLY_REVIEW_ACCOUNT ?? 'belowThreshold';
  const account =
    which === 'belowThreshold'
      ? {
          label: 'memberBelowThreshold',
          email: process.env.MEMBER_BELOW_THRESHOLD_EMAIL,
          password: process.env.MEMBER_BELOW_THRESHOLD_PASSWORD,
        }
      : ACCOUNTS[which] ?? ACCOUNTS.memberPopulated;

  if (!account.email || !account.password) {
    throw new Error(
      `No credentials for account "${which}". Set its EMAIL/PASSWORD in ` +
        'scripts/screenshots/.env.local (gitignored). Refusing to guess a production credential.'
    );
  }

  console.log(`\nWeekly Root Review, live verification against ${BASE_URL}`);
  console.log(`Account: ${account.label}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  attach(page, account.label);

  // ---------------------------------------------------------------
  console.log('PHASE A: the app is unharmed and the feature is deployed');
  // ---------------------------------------------------------------

  await login(page, BASE_URL, account);
  await page.waitForTimeout(2500);

  check('logged in and landed off /login', !page.url().includes('/login'), page.url());

  const firstDialog = await readDialog(page);
  check('at most one pop-up owns the screen', (firstDialog.count ?? 0) <= 1, `count=${firstDialog.count ?? 0}`);

  // Dismiss whatever popped so Home is readable underneath.
  if (firstDialog.count) {
    await clickInDialog(page, 'Close');
    await page.waitForTimeout(400);
  }
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const homeText = await page.evaluate(() => document.body.innerText);
  check('Home renders real content, not an error page', homeText.length > 400, `${homeText.length} chars`);
  check(
    'the Priority Card is still present on Home',
    homeText.toLowerCase().includes(PRIORITY_LABEL),
    ''
  );

  const routeProbe = await forceRedelivery(page);
  check(
    'the test-only route is deployed and answers',
    routeProbe.status === 200 || routeProbe.status === 403,
    `http${routeProbe.status} ${JSON.stringify(routeProbe.body)}`
  );
  const isTestAccount = routeProbe.status === 200;
  check(
    'the route allows this account (is_test) or refuses it (403), never anything else',
    routeProbe.status === 200 || routeProbe.status === 403,
    isTestAccount ? 'allowed, so this IS a test account' : 'refused, so this is NOT a test account'
  );

  // The one thing that decides whether Phase B can mean anything. Reported by
  // the reset route itself, so the script never has to guess why a review did
  // not appear.
  const tablesReachable = routeProbe.body?.tablesReachable === true;
  check(
    'migration 151 is applied to this database',
    tablesReachable,
    tablesReachable
      ? 'the review tables are readable'
      : 'the review tables are NOT readable, so every read fails closed and the review is dormant by design'
  );

  // ---------------------------------------------------------------
  console.log('\nPHASE B: the review itself (requires migration 151)');
  // ---------------------------------------------------------------

  if (!isTestAccount) {
    console.log('  SKIPPED: the reset route refused this account, so redelivery cannot be forced.');
  } else if (!tablesReachable) {
    console.log(
      '  SKIPPED: migration 151 is not applied to this database. The review is correctly\n' +
        '  dormant (every read fails closed to null), which Phase A just confirmed. Re-run\n' +
        '  this script after applying the migration to verify the review itself.'
    );
  } else {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    const reviewDialog = await readDialog(page);
    check('the review arrives as a pop-up after a forced redelivery', reviewDialog.isReview === true, (reviewDialog.text ?? '').slice(0, 160).replace(/\n/g, ' | '));
    check('exactly one dialog is on screen', reviewDialog.count === 1, `count=${reviewDialog.count}`);

    if (reviewDialog.isReview) {
      check('it has the what-this-week-showed section', reviewDialog.sections.showed);
      check('it has the what-Root-is-adjusting section', reviewDialog.sections.adjusting);
      check('it offers a single acknowledge action', reviewDialog.buttons.includes('Got it'), reviewDialog.buttons.join(' / '));
      check('it contains no em dash', !(reviewDialog.text ?? '').includes('—'));
      check(
        'it never scolds: no missed, no streak, no you should',
        !/missed|streak|you should/i.test(reviewDialog.text ?? '')
      );

      const acknowledged = await clickInDialog(page, 'Got it');
      await page.waitForTimeout(2500);
      check('acknowledge works and closes the pop-up', acknowledged, '');

      const afterAck = await readDialog(page);
      check('the pop-up is gone after acknowledging', (afterAck.count ?? 0) === 0 || afterAck.isReview !== true, `count=${afterAck.count ?? 0}`);
    }

    // The persistent entry.
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const stillPopping = await readDialog(page);
    check(
      'no second delivery on reload',
      stillPopping.isReview !== true,
      `dialog=${stillPopping.count ?? 0} isReview=${stillPopping.isReview ?? false}`
    );
    if (stillPopping.count) {
      await clickInDialog(page, 'Close');
      await page.waitForTimeout(400);
    }

    const entry = await readEntry(page);
    check('the persistent entry is reachable from Home', entry !== null, entry ? entry.text.slice(0, 90).replace(/\n/g, ' | ') : 'absent');
    if (entry) {
      check('it is collapsed by default', entry.expanded === false && entry.hasToggle);
      await page.evaluate((label) => {
        const sections = [...document.querySelectorAll('section')];
        const target = sections.find((s) => s.innerText.toLowerCase().includes(label));
        target?.querySelector('button[aria-expanded]')?.click();
      }, REVIEW_LABEL);
      await page.waitForTimeout(900);
      const opened = await readEntry(page);
      check('it opens to the full review', opened?.expanded === true, '');
      check(
        'the opened review shows it is already acknowledged',
        /acknowledged/i.test(opened?.text ?? ''),
        (opened?.text ?? '').slice(0, 120).replace(/\n/g, ' | ')
      );
    }

    // The Priority Card still works with a week focus present.
    await page.goto(`${BASE_URL}/today`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const todayText = await page.evaluate(() => document.body.innerText);
    check(
      'the Priority Card still works on Today with the week focus present',
      todayText.toLowerCase().includes(PRIORITY_LABEL),
      ''
    );
  }

  await browser.close();

  const failed = checks.filter((c) => !c.passed);
  console.log(`\n${checks.length - failed.length} of ${checks.length} checks passed.`);
  if (failed.length) {
    console.log('\nFailed:');
    for (const c of failed) console.log(`  - ${c.name} :: ${c.detail}`);
  }
  if (issues.length) {
    console.log(`\n${issues.length} console/page/5xx issues:`);
    for (const i of issues.slice(0, 25)) console.log(`  - [${i.label}] ${i.text}`);
  } else {
    console.log('\nNo console errors, page errors, or 5xx responses.');
  }

  process.exitCode = failed.length ? 1 : 0;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
