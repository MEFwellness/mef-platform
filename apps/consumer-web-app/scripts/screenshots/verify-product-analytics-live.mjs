#!/usr/bin/env node
// One-shot live verification for the Product Analytics Instrumentation
// task against production (app.mefwellness.com). Drives the real member
// journey a member would take (log in, Home, Daily Reset, Food Lens,
// Progress, Today, a locked/premium surface) using the standing
// production test accounts (docs/PRODUCTION_TEST_ACCOUNTS.md), and
// reports two things per step:
//
//   1. Did the screen load and behave normally? Tracking must be
//      invisible and must never break or slow anything, so any page
//      error, failed navigation, or 500 here is a real regression.
//   2. Did the analytics server action get called, and what did the
//      network say? The tracker components call server actions from a
//      mount effect, so a real POST to the page's own route is the
//      browser-observable proof the call fired.
//
// This script deliberately does NOT claim an event row was written: the
// only way to confirm that is to query the production event table, which
// needs a production Supabase credential this environment does not have.
// It reports what it can actually observe and nothing more.
//
// Usage, from apps/consumer-web-app:
//   SCREENSHOT_TARGET=live node scripts/screenshots/verify-product-analytics-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL } from './config.mjs';
import { login } from './lib.mjs';

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
    if (request.method() !== 'POST') return;
    const headers = request.headers();
    // Next.js server actions are POSTs to the current route carrying a
    // Next-Action header. That header is how a tracker's fired action is
    // distinguishable from an ordinary form post.
    if (headers['next-action']) {
      serverActionPosts.push({ url: request.url(), at: Date.now() });
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      pageIssues.push({ kind: 'http5xx', text: `${response.status()} ${response.url()}`, url: page.url() });
    }
  });
}

async function visit(page, path, label) {
  const before = serverActionPosts.length;
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load', timeout: 45000 });
  // The tracker fires from a mount effect, after paint. Give the browser
  // a real moment to run it, the same way a member's device would.
  await page.waitForTimeout(2500);
  const status = response ? response.status() : 0;
  const fired = serverActionPosts.length - before;
  const landed = new URL(page.url()).pathname;
  return { status, fired, landed, label };
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  attachListeners(page);

  try {
    const beforeLogin = serverActionPosts.length;
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    record(
      'Log in (password)',
      'PASS',
      `Signed in as memberPopulated, landed on ${new URL(page.url()).pathname}. ` +
        `${serverActionPosts.length - beforeLogin} server action POST(s) during sign-in ` +
        '(signIn itself is a server action, so at least one is expected).'
    );

    const surfaces = [
      ['/dashboard', 'Home'],
      ['/checkin', 'Daily Reset'],
      ['/food-lens', 'Food Lens'],
      ['/progress', 'Progress (Your Wellness Story)'],
      ['/today', 'Today'],
      ['/case', 'Your Case'],
      ['/movement', 'Movement'],
      ['/questionnaires', 'Questionnaires (locked/premium markers live here)'],
      ['/membership', 'Membership (upgrade surface)'],
    ];

    for (const [path, label] of surfaces) {
      const r = await visit(page, path, label);
      const ok = r.status === 200 && r.landed === path;
      record(
        `Open ${label} (${path})`,
        ok ? 'PASS' : 'FAIL',
        `HTTP ${r.status}, landed on ${r.landed}. ` +
          `${r.fired} tracker server action POST(s) observed after paint.`
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
    for (const issue of pageIssues) console.log(`  [${issue.kind}] ${issue.text}  (on ${issue.url})`);
  }

  console.log('\n==== Summary ====');
  for (const r of results) console.log(`  [${r.status}] ${r.step}`);
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed.`);
  console.log(
    '\nNOT verified by this script: whether an event row landed in the production ' +
      'event table. That needs a production database credential this environment ' +
      'does not have, and migration 146 has not been applied to production yet.'
  );
}

main();
