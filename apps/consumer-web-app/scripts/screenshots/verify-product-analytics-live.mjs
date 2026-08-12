#!/usr/bin/env node
// One-shot live verification for the Product Analytics Instrumentation
// task against production (app.mefwellness.com). Drives the real member
// journey a member would take (log in, Home, complete a Daily Reset, Food
// Lens, Progress, Today, Your Case, Movement, a locked/premium surface)
// using the standing production test accounts
// (docs/PRODUCTION_TEST_ACCOUNTS.md).
//
// Reports two things per step:
//
//   1. Did the screen load and behave normally? Tracking must be
//      invisible and must never break or slow anything, so any page
//      error, failed navigation, or 5xx here is a real regression.
//   2. Did the analytics server action fire? The tracker components call
//      server actions from a mount effect, so a POST carrying a
//      Next-Action header is the browser-observable proof the call ran.
//
// It also prints the exact UTC instant the journey began, so the
// production event table can be queried for "everything this journey
// produced and nothing else":
//
//   select event_type, payload, occurred_at
//   from product_analytics_events
//   where member_id = '<id>' and occurred_at >= '<printed instant>'
//   order by occurred_at;
//
// Deliberately writes no screenshots (it does not call lib.mjs's shot())
// so a verification run never churns docs/screens.
//
// Usage, from apps/consumer-web-app:
//   SCREENSHOT_TARGET=live node scripts/screenshots/verify-product-analytics-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login, answerVisibleQuestions, lastResortFill, wizardAdvanceButton } from './lib.mjs';

const results = [];
const pageIssues = [];
const serverActionPosts = [];

function record(step, status, detail) {
  results.push({ step, status, detail });
  console.log(`\n[${status}] ${step}\n    ${detail}`);
}

function attachListeners(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      pageIssues.push({ kind: 'console.error', text: msg.text(), url: page.url() });
    }
  });
  page.on('pageerror', (err) => {
    pageIssues.push({ kind: 'pageerror', text: err.message, url: page.url() });
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action']) {
      serverActionPosts.push({ url: request.url() });
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      pageIssues.push({
        kind: 'http5xx',
        text: `${response.status()} ${response.url()}`,
        url: page.url(),
      });
    }
  });
}

async function visit(page, path) {
  const before = serverActionPosts.length;
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load', timeout: 45000 });
  // The tracker fires from a mount effect, after paint. Give the browser a
  // real moment to run it, the same way a member's device would.
  await page.waitForTimeout(2500);
  return {
    status: response ? response.status() : 0,
    fired: serverActionPosts.length - before,
    landed: new URL(page.url()).pathname,
  };
}

/** Same shape as lib.mjs's walkCheckinWizard, minus the screenshots. */
async function completeCheckinWizard(page, maxScreens = 14) {
  for (let screenNum = 1; screenNum <= maxScreens; screenNum++) {
    const button = wizardAdvanceButton(page);
    await button.waitFor({ state: 'visible', timeout: 15000 });
    const label = (await button.textContent())?.trim();
    const isFinal = label !== 'Continue';

    for (let attempt = 0; attempt < 2 && (await button.isDisabled()); attempt++) {
      await answerVisibleQuestions(page);
    }
    if (await button.isDisabled()) await lastResortFill(page);
    if (await button.isDisabled()) {
      throw new Error(`Advance button still disabled on screen ${screenNum}`);
    }

    await button.click();

    if (isFinal) {
      const endingContinue = page.getByRole('button', { name: 'Continue' });
      await endingContinue.waitFor({ state: 'visible', timeout: 20000 });
      await endingContinue.click();
      await page.waitForTimeout(2000);
      return screenNum;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Did not reach a final screen within ${maxScreens} screens`);
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`Journey start (UTC): ${startedAt}`);
  console.log(`Target: ${BASE_URL}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  attachListeners(page);

  try {
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    record(
      'Log in (password) -> expects session_started',
      'PASS',
      `Signed in as memberPopulated, landed on ${new URL(page.url()).pathname}.`
    );

    const home = await visit(page, '/dashboard');
    record(
      'Open Home -> expects surface_viewed(home)',
      home.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${home.status}, landed on ${home.landed}, ${home.fired} tracker POST(s).`
    );

    const reset = await visit(page, '/checkin');
    record(
      'Open Daily Reset -> expects surface_viewed(daily_reset) + daily_reset_started',
      reset.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${reset.status}, landed on ${reset.landed}, ${reset.fired} tracker POST(s).`
    );

    try {
      const screens = await completeCheckinWizard(page);
      record(
        'Complete the Daily Reset -> expects daily_reset_completed',
        'PASS',
        `Walked and submitted the wizard across ${screens} screens, ending screen dismissed.`
      );
    } catch (err) {
      record('Complete the Daily Reset -> expects daily_reset_completed', 'FAIL', err.message);
    }

    const rest = [
      ['/food-lens', 'Food Lens', 'surface_viewed(food_lens)'],
      ['/progress', 'Progress (Your Wellness Story)', 'surface_viewed(progress)'],
      ['/today', 'Today', 'surface_viewed(today)'],
      ['/case', 'Your Case', 'surface_viewed(your_case)'],
      ['/movement', 'Movement', 'surface_viewed(movement)'],
      ['/questionnaires', 'Questionnaires', 'surface_viewed(questionnaires) + any paywall_viewed'],
      ['/membership', 'Membership', 'surface_viewed(membership) + paywall_viewed(membership)'],
    ];
    for (const [path, label, expects] of rest) {
      const r = await visit(page, path);
      const ok = r.status === 200 && r.landed === path;
      record(
        `Open ${label} -> expects ${expects}`,
        ok ? 'PASS' : 'FAIL',
        `HTTP ${r.status}, landed on ${r.landed}, ${r.fired} tracker POST(s).`
      );
    }
  } catch (err) {
    record('Journey', 'FAIL', `Threw: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log('\n\n==== Page errors observed ====');
  if (pageIssues.length === 0) {
    console.log('None. No console errors, no page errors, no 5xx responses.');
  } else {
    for (const issue of pageIssues) {
      console.log(`  [${issue.kind}] ${issue.text}  (on ${issue.url})`);
    }
  }

  console.log('\n==== Summary ====');
  for (const r of results) console.log(`  [${r.status}] ${r.step}`);
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed.`);
  console.log(`\nNow query production for events with occurred_at >= ${startedAt}`);
}

main();
