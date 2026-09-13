#!/usr/bin/env node
/**
 * The 2026-09-13 fix set, driven on production as a real member.
 *
 * WHAT IT PROVES, AND WHAT IT DELIBERATELY CANNOT.
 *
 * THE SIGN-IN TIMEOUT. Turnstile is live on production's auth forms and
 * correctly refuses a scripted browser, so no automated run will ever
 * complete the login form and no automated run can therefore watch the
 * timeout error appear or not appear. CLAUDE.md says never to report that
 * refusal as a failure and never to ask for the check to be turned off.
 * So this measures the two things that ARE observable and that the
 * failure was actually made of:
 *
 *   - HOW SOON the bot check can start on /login and /signup, which is
 *     the part of a member's submit budget the app itself controls.
 * Which WAIT the deployed JavaScript carries is not asserted here. A
 * minified bundle full of numbers is a bad place to prove a constant, and
 * a check that cannot fail honestly is worse than none. The deployment's
 * own commit is what says the change is live, and the deploy report names
 * it.
 *
 * EVERYTHING ELSE IS DRIVEN FOR REAL, signed in with a one-time session
 * minted from the service-role key and retired immediately afterwards:
 * the Daily Reset read question by question, Home's Active Experiments
 * section, and a Morning Mobility session opened, begun and closed.
 *
 * IT SUBMITS NOTHING. The Daily Reset is read and abandoned, never
 * submitted. The movement session is begun, which writes the one run row
 * any real open of that session writes, and then left.
 *
 * Environment:
 *   BASE_URL   default https://app.mefwellness.com
 *   TEST_MEMBER_EMAIL
 *   PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / PROD_ANON_KEY_FILE
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { canMintSessions, mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = (process.env.BASE_URL ?? 'https://app.mefwellness.com').replace(/\/$/, '');
const MEMBER_EMAIL = process.env.TEST_MEMBER_EMAIL;
const SHOTS = process.env.SHOTS_DIR ?? './scripts/.verify/auth-and-daily-reset-fixes';
const PHONE = { width: 390, height: 844 };
const EM_DASH = '—';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};
const note = (m) => console.log(`      ${m}`);

function watch(page, bag) {
  page.on('console', (m) => {
    if (m.type() === 'error') bag.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => bag.push(`${page.url()} :: ${e.message}`));
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
}

/**
 * Phrases that would mean a question still assumes the day is finished.
 * Matched against the questions actually rendered on the live screen, not
 * against the repository's own copy of them.
 */
const END_OF_DAY_PHRASES = [
  "how many of today's meals had",
  "what's most of today's stress",
  'how active would you say you were today',
  'how was your digestion today',
  'did today feel rushed from start to finish',
  'did you feel like you drank enough water today',
  'how many meals did you skip today',
  'how emotionally heavy did today feel',
  'how many bowel movements today',
  'were you mostly indoors today',
  'was today a planned rest day',
  'did you have any alcohol today',
  'how many caffeinated drinks did you have today',
  'any strong cravings today',
  'did you hit an energy crash',
  'what was the longest stretch',
  'about how many hours did you spend sitting today',
  'about how many hours were you at a desk',
  'how much time did you spend barefoot today',
  'what were you mostly in, shoe-wise',
  'did you notice yourself favoring one side',
  'did you catch yourself sighing',
  'about how much time did you spend outdoors today',
  'about how much unstructured time did you get',
];

async function run() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const consoleErrors = [];
  let minted = null;

  try {
    // ---------------------------------------------------------------
    // 1. The signed-out auth screens.
    // ---------------------------------------------------------------
    for (const path of ['/login', '/signup']) {
      const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      watch(page, consoleErrors);
      const cfHits = [];
      const started = Date.now();
      page.on('response', (response) => {
        if (response.url().includes('challenges.cloudflare.com') && response.url().includes('api.js')) {
          cfHits.push(Date.now() - started);
        }
      });
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const domReady = Date.now() - started;

      // The preload tag is in the SERVER-RENDERED html, which is the whole
      // point of it: the download starts during parse rather than after
      // hydration. Asserted on the markup, not on a timing.
      const preloaded = await page.evaluate(() =>
        Array.from(document.querySelectorAll('script[src]')).some((s) =>
          (s.getAttribute('src') ?? '').includes('challenges.cloudflare.com')
        )
      );
      check(`${path} asks for the bot check script in the page itself`, preloaded, `dom ready ${domReady}ms`);

      await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
      note(`${path}: Cloudflare api.js answered at ${cfHits.length ? `${cfHits[0]}ms` : 'never'}`);

      // A service worker registration on a signed-out auth screen used to
      // compete with all of the above for the same seconds.
      const swRegistered = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return false;
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.length > 0;
      });
      check(`${path} registers no service worker while signed out`, swRegistered === false);

      const text = await page.evaluate(() => document.body.innerText ?? '');
      check(`${path} carries no em dash`, !text.includes(EM_DASH));

      await shot(page, `auth${path.replace('/', '-')}`);
      await context.close();
    }

    // ---------------------------------------------------------------
    // 2. Signed in, for real.
    // ---------------------------------------------------------------
    if (!canMintSessions() || !MEMBER_EMAIL) {
      check('a signed-in session could be minted', false, 'missing PROD_* keys or TEST_MEMBER_EMAIL');
      return;
    }
    minted = await mintSessionContext(browser, MEMBER_EMAIL, { baseUrl: BASE, viewport: PHONE });
    if (!minted) {
      check('a signed-in session could be minted', false, 'generateLink or verifyOtp refused');
      return;
    }
    check('a signed-in session could be minted', true);
    const page = await minted.context.newPage();
    watch(page, consoleErrors);

    // --------------------------- Home ------------------------------
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
    const homeText = await page.evaluate(() => document.body.innerText ?? '');
    if (/active experiments/i.test(homeText)) {
      const rows = page.locator('button[aria-expanded]').filter({ hasText: /Day \d+ of \d+/ });
      const rowCount = await rows.count();
      check('Active Experiments renders as slim rows in one card', rowCount > 0, `${rowCount} rows`);
      if (rowCount > 0) {
        await rows.first().click();
        await page.waitForTimeout(1200);
        const expanded = await rows.first().getAttribute('aria-expanded');
        check('a row opens onto its own experiment panel', expanded === 'true');
        await shot(page, 'home-experiments-open');
        await rows.first().click();
        await page.waitForTimeout(800);
      }
      await shot(page, 'home-active-experiments');
    } else {
      note('This account has no Active Experiments section right now, so its layout could not be driven.');
      check('Active Experiments section present to drive', false, 'nothing running on this account');
    }
    check('Home carries no em dash', !homeText.includes(EM_DASH));

    // ------------------------ Daily Reset --------------------------
    await page.goto(`${BASE}/checkin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    const seenQuestions = new Set();
    for (let step = 0; step < 16; step += 1) {
      const text = await page.evaluate(() => document.body.innerText ?? '');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length > 12 && /[?:]$/.test(trimmed)) seenQuestions.add(trimmed);
      }
      const next = page.getByRole('button', { name: /^(continue|next)$/i }).first();
      if ((await next.count()) === 0) break;
      if (!(await next.isEnabled().catch(() => false))) break;
      await next.click().catch(() => {});
      await page.waitForTimeout(1400);
    }
    await shot(page, 'daily-reset');
    note(`Questions read on the Daily Reset: ${seenQuestions.size}`);
    for (const q of seenQuestions) note(`  ${q}`);
    const offenders = [...seenQuestions].filter((q) =>
      END_OF_DAY_PHRASES.some((phrase) => q.toLowerCase().includes(phrase))
    );
    check('no Daily Reset question assumes the day is over', offenders.length === 0, offenders.join(' | '));
    check(
      'no Daily Reset question carries an em dash',
      ![...seenQuestions].some((q) => q.includes(EM_DASH))
    );

    // -------------------- Morning Mobility X -----------------------
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.goto(`${BASE}/movement/sessions/morning_mobility`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);
    const begin = page.getByRole('button', { name: /^begin$/i }).first();
    const canBegin = (await begin.count()) > 0;
    check('Morning Mobility opens', canBegin);
    if (canBegin) {
      await begin.click();
      await page.waitForTimeout(1800);
      await shot(page, 'session-playing');
      const leave = page.getByRole('button', { name: /leave this session/i }).first();
      const hasLeave = (await leave.count()) > 0;
      check('the session shows its close control', hasLeave);
      if (hasLeave) {
        await leave.click();
        await page.waitForTimeout(3000);
        const url = page.url();
        check(
          'the X leaves the session rather than reopening its detail page',
          !url.includes('/movement/sessions/morning_mobility'),
          url
        );
        await shot(page, 'session-after-x');
      }
    }
  } finally {
    await retireSession(minted);
    await browser.close();
  }

  console.log('');
  if (consoleErrors.length === 0) console.log('No console or page errors on any screen visited.');
  else {
    console.log(`Console/page errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 25)) console.log(`  ${e}`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('Failed:');
    for (const f of failed) console.log(`  ${f.name}`);
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
