#!/usr/bin/env node
// Measures how long a member waits between tapping a Root pop-up button and
// seeing ANYTHING change, under a simulated slow connection.
//
// WHY THIS EXISTS. "The app feels frozen after I answer the pop-up" is a
// timing claim, and a timing claim can only be settled by a clock. This
// drives the real Priority Card pop-up and the real Weekly Root Review
// pop-up in a real browser, with Chrome's own Slow 3G profile applied
// through CDP, and reports four numbers per button:
//
//   visualMs      tap -> the first change the member can actually see
//   settledMs     tap -> the last network request the tap caused finished
//   navMs         tap -> a bottom-nav tap is honoured (the "whole app is
//                 frozen" symptom, which is about the router, not the card)
//   disabledMs    how long the pop-up's own buttons stayed disabled
//
// Throttling is applied AFTER login and AFTER the dashboard has painted, so
// the numbers isolate the tap rather than measuring page load.
//
// Usage:
//   node scripts/screenshots/measure-popup-latency.mjs                # local prod build
//   SCREENSHOT_TARGET=live node scripts/screenshots/measure-popup-latency.mjs
//
// Optional: MEASURE_ACCOUNT=memberPopulated, MEASURE_PROFILE=slow3g|fast3g|none

import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL, TARGET } from './config.mjs';

/**
 * Deliberately not lib.mjs's own `login`. That one waits on a document
 * `load` event, and signing in is a Server Action redirect, i.e. a client
 * router navigation with no document load at all — it happens to work when
 * the browser also does a full reload afterwards and times out when it does
 * not. This waits on the thing that actually changes.
 */
async function login(page, baseUrl, { email, password }) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'load' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    if (!new URL(page.url()).pathname.startsWith('/login')) return;
  }
  throw new Error(`login never left /login (still ${page.url()})`);
}

const PROFILES = {
  // Chrome DevTools' own presets, in the units CDP wants (bytes/second).
  slow3g: { latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 },
  fast3g: { latency: 150, downloadThroughput: (1638 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  none: null,
};

const PROFILE_NAME = process.env.MEASURE_PROFILE || 'slow3g';
const ACCOUNT = ACCOUNTS[process.env.MEASURE_ACCOUNT || 'memberPopulated'];

/** Every in-flight request, so "settled" means settled and not "probably done by now". */
function trackNetwork(page) {
  const state = { inflight: 0, lastFinishedAt: 0 };
  page.on('request', () => {
    state.inflight += 1;
  });
  const done = () => {
    state.inflight = Math.max(0, state.inflight - 1);
    state.lastFinishedAt = Date.now();
  };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return state;
}

async function throttle(page, profile) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile ? profile.latency : 0,
    downloadThroughput: profile ? profile.downloadThroughput : -1,
    uploadThroughput: profile ? profile.uploadThroughput : -1,
  });
  return client;
}

/** The pop-up currently owning the screen, if any. */
function readDialog(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    return {
      text: dialog.innerText,
      buttons: [...dialog.querySelectorAll('button')].map((b) => ({
        label: b.innerText.trim(),
        disabled: b.disabled,
      })),
    };
  });
}

/**
 * Taps one button and measures how long until `predicate` (a source string
 * evaluated in the page) first becomes true.
 *
 * The clock starts inside the page, on the same tick as the click, so the
 * number never includes Playwright's own round trip to the browser.
 */
async function tapAndMeasure(page, net, buttonLabel, predicateSource, expectClose) {
  const found = await page.evaluate((label) => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const button = [...dialog.querySelectorAll('button')].find(
      (b) => b.innerText.trim().toLowerCase() === label.toLowerCase()
    );
    if (!button) return false;
    window.__t0 = performance.now();
    window.__disabledUntil = null;
    // Records how long the pop-up's own buttons stay disabled, sampled every
    // frame, because that is what a member experiences as "it stopped
    // responding" even when something on screen did change.
    const sample = () => {
      const d = document.querySelector('[role="dialog"]');
      const anyDisabled = d ? [...d.querySelectorAll('button')].some((b) => b.disabled) : false;
      if (anyDisabled) {
        window.__disabledUntil = performance.now();
        requestAnimationFrame(sample);
      } else if (window.__disabledUntil === null && performance.now() - window.__t0 < 30000) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
    button.click();
    return true;
  }, buttonLabel);

  if (!found) return { ok: false, reason: `button "${buttonLabel}" not found` };

  const startedAt = Date.now();
  let visualMs = null;
  try {
    await page.waitForFunction(predicateSource, null, { polling: 'raf', timeout: 45000 });
    visualMs = await page.evaluate(() => performance.now() - window.__t0);
  } catch {
    return { ok: false, reason: 'no visible response within 45s' };
  }

  // How long the pop-up itself stays on screen after the tap. For a button
  // whose job is to dismiss the pop-up, this — not the first pixel that
  // changes — is what the member calls "it responded".
  let closeMs = null;
  if (expectClose) {
    try {
      await page.waitForFunction('!document.querySelector(\'[role="dialog"]\')', null, {
        polling: 'raf',
        timeout: 20000,
      });
      closeMs = Math.round(await page.evaluate(() => performance.now() - window.__t0));
    } catch {
      closeMs = null; // still on screen 20s after the tap
    }
  }

  const disabledMs = await page.evaluate(() =>
    window.__disabledUntil === null ? 0 : window.__disabledUntil - window.__t0
  );

  return {
    ok: true,
    visualMs: Math.round(visualMs),
    disabledMs: Math.round(disabledMs),
    ...(closeMs === null ? {} : { closeMs }),
    startedAt,
  };
}

/** No request in flight for 750ms straight. */
async function waitForSettle(page, net, startedAt) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (net.inflight === 0 && Date.now() - net.lastFinishedAt > 750) break;
    await page.waitForTimeout(100);
  }
  return { ok: true, settledMs: Math.max(0, net.lastFinishedAt - startedAt) };
}

/**
 * The "whole app is frozen" measurement, separate from the card's own.
 * Taps the bottom-nav link to Today immediately after a pop-up answer and
 * reports how long the router took to honour it.
 */
async function measureNavigation(page) {
  if (process.env.MEASURE_NAV_DELAY_MS) {
    await page.waitForTimeout(Number(process.env.MEASURE_NAV_DELAY_MS));
  }
  const before = page.url();
  const started = Date.now();
  const clicked = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find(
      (a) => new URL(a.href, location.origin).pathname === '/today'
    );
    if (!link) return false;
    link.click();
    return true;
  });
  if (!clicked) return { ok: false, reason: 'no /today link on the page' };
  try {
    await page.waitForFunction(
      'location.pathname === "/today"',
      null,
      { polling: 'raf', timeout: 45000 }
    );
  } catch {
    return { ok: false, reason: 'navigation never happened within 45s', from: before };
  }
  return { ok: true, navMs: Date.now() - started };
}

function report(title, result) {
  if (!result.ok) {
    console.log(`  ${title.padEnd(22)} SKIPPED (${result.reason})`);
    return;
  }
  const parts = [];
  if (result.visualMs !== undefined) parts.push(`visual ${result.visualMs}ms`);
  if (result.disabledMs !== undefined) parts.push(`buttons disabled ${result.disabledMs}ms`);
  if (result.closeMs !== undefined) parts.push(`popup closed ${result.closeMs}ms`);
  if (result.settledMs !== undefined) parts.push(`settled ${result.settledMs}ms`);
  if (result.navMs !== undefined) parts.push(`nav honoured ${result.navMs}ms`);
  console.log(`  ${title.padEnd(22)} ${parts.join('   ')}`);
}

async function openDashboard(page) {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });

  // Both the wearable-connect welcome modal and the Root chain mount well
  // after first paint, and which one arrives first varies, so this polls
  // rather than sleeping a fixed amount. The wearable modal owns the screen
  // ahead of the Root chain on an account that has never answered it; it is
  // dismissed the way a member would, so the pop-up under test is the one
  // that actually gets measured.
  const deadline = Date.now() + Number(process.env.MEASURE_OPEN_TIMEOUT_MS || 25000);
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return 'none';
      return /wearable|get the most from root/i.test(dialog.innerText) ? 'wearable' : 'root';
    });
    if (state === 'root') {
      // Only one Root message owns the screen per visit, so an unrelated
      // one (a day-3 experiment follow-up, say) hides the two this script
      // measures. MEASURE_CLEAR_CHAIN snoozes it with its own "Maybe
      // later" — deliberately snooze and not "Ignore", because snoozing
      // moves it out of the way for this visit without retiring a real
      // pending message on a test account forever.
      const target = await page.evaluate(() => {
        const text = document.querySelector('[role="dialog"]').innerText.toLowerCase();
        return text.includes('your priority today') || text.includes('your week with root');
      });
      if (target || !process.env.MEASURE_CLEAR_CHAIN) return;
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const later = [...dialog.querySelectorAll('button')].find((b) =>
          /maybe later|not now|^close$/i.test(b.innerText.trim())
        );
        later?.click();
      });
      await page.waitForTimeout(4000);
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load' });
      continue;
    }
    if (state === 'wearable') {
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const later = [...dialog.querySelectorAll('button')].find((b) =>
          /maybe later|not now|later/i.test(b.innerText)
        );
        later?.click();
      });
      await page.waitForTimeout(2500);
    }
  }
}

async function run() {
  const profile = PROFILES[PROFILE_NAME];
  console.log(`target=${TARGET} base=${BASE_URL} account=${ACCOUNT.label} profile=${PROFILE_NAME}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const net = trackNetwork(page);

  await login(page, BASE_URL, ACCOUNT);

  // Optional hook for putting the account back to "has not been shown
  // today's pop-up yet", so the same tap can be measured more than once.
  // It runs AFTER login on purpose: signing in is itself an app open, and
  // on a fresh session the chain can spend the day's single showing before
  // the measurement starts. Never hardcodes what the reset is — locally
  // that is SQL against the throwaway container, live it is the existing
  // test-only route.
  if (process.env.MEASURE_RESET_CMD) {
    execSync(process.env.MEASURE_RESET_CMD, { stdio: 'inherit' });
  }
  // Against production the reset is the existing test-only route, called
  // with the signed-in session this browser already holds. It refuses on any
  // account that is not flagged is_test, in the handler and again in RLS.
  if (process.env.MEASURE_RESET_ROUTE) {
    const response = await page.request.post(`${BASE_URL}${process.env.MEASURE_RESET_ROUTE}`);
    console.log(`reset ${process.env.MEASURE_RESET_ROUTE} -> ${response.status()} ${await response.text()}`);
  }

  await openDashboard(page);

  const dialog = await readDialog(page);
  if (!dialog) {
    console.log('\nNo pop-up on screen. Nothing to measure — reset the pop-up state first.');
    await browser.close();
    return;
  }
  console.log(`\npop-up: ${dialog.buttons.map((b) => b.label).join(' | ')}`);

  await throttle(page, profile);
  console.log(`throttling applied (${PROFILE_NAME})\n`);

  const isWeeklyReview = /your week with root/i.test(dialog.text);
  const isPriority = dialog.text.toLowerCase().includes('your priority today');

  const BUTTONS = {
    done: [
      'Done',
      `(() => { const d = document.querySelector('[role="dialog"]'); return !d || ![...d.querySelectorAll('button')].some(b => b.innerText.trim().toLowerCase() === 'done'); })()`,
    ],
    save: [
      'Save for later',
      `(() => { const d = document.querySelector('[role="dialog"]'); return !d || /saved/i.test(d.innerText); })()`,
    ],
    help: [
      'Help me',
      `(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return false; const btn = [...d.querySelectorAll('button')].find(b => b.innerText.trim().toLowerCase() === 'help me'); return btn ? btn.getAttribute('aria-expanded') === 'true' : false; })()`,
    ],
    gotit: [
      'Got it',
      `(() => { const d = document.querySelector('[role="dialog"]'); return !d || /acknowledged/i.test(d.innerText); })()`,
    ],
  };

  if (isPriority || isWeeklyReview) {
    const key = isWeeklyReview ? 'gotit' : (process.env.MEASURE_BUTTON || 'done').toLowerCase();
    const [label, predicate] = BUTTONS[key] ?? BUTTONS.done;
    // Only "Got it" is supposed to dismiss the pop-up. The Priority Card's
    // three buttons deliberately leave it on screen showing its resolved
    // state, so waiting for it to close there would just be a timeout.
    const tap = await tapAndMeasure(page, net, label, predicate, key === 'gotit');
    // Navigation is probed BEFORE waiting for the network to go quiet, on
    // purpose: "the whole app is frozen" is a claim about what happens
    // while the answer is still being written, not afterwards.
    const nav = process.env.MEASURE_SKIP_NAV
      ? { ok: false, reason: 'skipped (MEASURE_SKIP_NAV)' }
      : await measureNavigation(page);
    const settle = tap.ok ? await waitForSettle(page, net, tap.startedAt) : { ok: false, reason: 'no tap' };
    report(label, tap);
    report('  during the write:', nav);
    report('  network quiet at:', settle);
  } else {
    console.log('pop-up is neither the Priority Card nor the Weekly Root Review; nothing measured.');
  }

  console.log(`\nconsole/page errors: ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log(`  ! ${e}`);
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
