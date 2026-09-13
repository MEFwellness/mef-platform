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
      // Addressed by its own handle, never by its words: an open row
      // deliberately stops saying the day and the logged state, so a
      // text-built locator would lose the row it had just tapped.
      const rows = page.locator('[data-testid="active-experiment-row"]');
      const rowCount = await rows.count();
      check('Active Experiments renders as slim rows in one card', rowCount > 0, `${rowCount} rows`);
      if (rowCount > 0) {
        /*
         * A plain DOM click, deliberately. Home's sections arrive through
         * RevealOnScroll, whose transform keeps Playwright's own
         * "scroll into view then click" retrying forever with "element is
         * outside of the viewport" against a button it can already see.
         * The row is an ordinary button with an ordinary onClick; nothing
         * about this tap needs a real pointer.
         */
        const first = rows.first();
        await first.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(400);
        await first.evaluate((el) => el.click());
        await page.waitForTimeout(1200);
        const expanded = await first.getAttribute('aria-expanded');
        check('a row opens onto its own experiment panel', expanded === 'true');
        const openText = await page.evaluate(() => document.body.innerText ?? '');
        check(
          'the opened panel offers the real logging controls',
          /\bYes\b/.test(openText) && /Not today/.test(openText)
        );
        await shot(page, 'home-experiments-open');
        await first.evaluate((el) => el.click());
        await page.waitForTimeout(800);
        const closed = await first.getAttribute('aria-expanded');
        check('and closes again', closed === 'false');
      }
      await shot(page, 'home-active-experiments');
    } else {
      note('This account has no Active Experiments section right now, so its layout could not be driven.');
      check('Active Experiments section present to drive', false, 'nothing running on this account');
    }
    check('Home carries no em dash', !homeText.includes(EM_DASH));

    // ------------------------ Daily Reset --------------------------
    // The wizard is Continue-only, so the walk is: read what this screen
    // asks, answer everything answerable on it, press Continue, repeat.
    // Answers are chosen structurally (the middle option of each group),
    // never by question text, so this survives the bank changing. Ported
    // from scripts/verify-checkin-then-home-live.mjs, which is the walk
    // that already knows the traps: never touch the coach-note toggle,
    // never touch a step dot, never leave the wizard's own region.
    const NAV =
      /^(continue|next|back|done|submit|finish|save|skip|close|exit|cancel|update|home|go to screen|sign out|profile|membership|connected devices|notifications|help|about|e$)/i;
    const DO_NOT_TOUCH = /send your coach|something new or worsening/i;
    const ANSWER_SELECTOR =
      'main button:not([disabled]), main [role="radio"], main [role="option"], main [role="switch"]';

    await page.goto(`${BASE}/checkin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    const seenQuestions = new Set();
    let stuckOn = null;
    let screensWalked = 0;
    for (let screen = 0; screen < 12; screen += 1) {
      await page.waitForTimeout(900);
      screensWalked = screen + 1;

      // Read the screen BEFORE answering it, so a question that a follow-up
      // replaces is still recorded.
      const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? '');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length > 12 && /[?:]$/.test(trimmed)) seenQuestions.add(trimmed);
      }
      await shot(page, `daily-reset-${String(screen).padStart(2, '0')}`);

      const groups = await page.evaluate(([navSource, selector]) => {
        const nav = new RegExp(navSource, 'i');
        const byParent = new Map();
        const controls = Array.from(document.querySelectorAll(selector));
        controls.forEach((el, domIndex) => {
          const name =
            (el.textContent ?? '').trim().replace(/\s+/g, ' ') || el.getAttribute('aria-label') || '';
          if (!name || nav.test(name) || /send your coach|something new or worsening/i.test(name)) return;
          const key = el.parentElement
            ? Array.from(document.querySelectorAll('*')).indexOf(el.parentElement)
            : -1;
          if (!byParent.has(key)) byParent.set(key, []);
          byParent.get(key).push({ domIndex, name });
        });
        return Array.from(byParent.values()).filter((g) => g.length >= 2);
      }, [NAV.source, ANSWER_SELECTOR]);

      const controls = page.locator(ANSWER_SELECTOR);
      for (const group of groups) {
        const pick = group[Math.floor(group.length / 2)];
        await controls.nth(pick.domIndex).click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(250);
      }

      const continueBtn = page.getByRole('button', {
        name: /^(continue|finish|submit|done|save check-in)$/i,
      });
      if ((await continueBtn.count()) === 0) break;

      if (!(await continueBtn.first().isEnabled().catch(() => false))) {
        const remaining = page.locator(ANSWER_SELECTOR);
        const total = await remaining.count();
        for (let i = 0; i < total; i += 1) {
          const el = remaining.nth(i);
          const name = ((await el.innerText().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
          if (!name || NAV.test(name) || DO_NOT_TOUCH.test(name)) continue;
          await el.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(250);
          if (await continueBtn.first().isEnabled().catch(() => false)) break;
        }
      }

      if (!(await continueBtn.first().isEnabled().catch(() => false))) {
        stuckOn = screen;
        break;
      }

      // This walk READS the Daily Reset, it does not file one. The last
      // control saves, so it stops there rather than writing a check-in
      // nobody sat down to do.
      const label = ((await continueBtn.first().innerText().catch(() => '')) || '').trim();
      if (/save check-in|submit|finish/i.test(label)) break;

      await continueBtn.first().click();
      await page.waitForTimeout(2200);
      if (!page.url().includes('/checkin')) break;
    }

    check(
      'every Daily Reset screen was answerable',
      stuckOn === null,
      stuckOn === null ? `${screensWalked} screens` : `stuck on screen ${stuckOn}`
    );
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
