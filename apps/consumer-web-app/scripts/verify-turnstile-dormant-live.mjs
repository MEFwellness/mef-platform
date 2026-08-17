#!/usr/bin/env node
/**
 * Live verification that bot protection is present and dormant on the real
 * production site, with the Supabase captcha switch still OFF.
 *
 * The thing being proved is not that the widget looks nice. It is that
 * shipping it changed nothing: a real member can still sign in with a real
 * password, and the signup and forgot-password screens still work, while
 * Cloudflare's check is already wired into every one of those forms. That
 * combination is what makes flipping the Supabase switch safe afterwards.
 *
 * One thing this script cannot do, and says so rather than pretending
 * otherwise: it cannot make Turnstile issue a token. It drives a headless
 * browser, which is automation, and Turnstile correctly declines to clear
 * automation silently. That is the product working. It also turns out to be
 * the strongest possible test of the safety property, because every screen
 * below is exercised with NO token at all, which is exactly the worst case
 * a real member could hit if Cloudflare were having a bad day. All of them
 * still work.
 *
 * Whether a real person on a real phone is challenged is a question only a
 * real person on a real phone can answer, and it belongs in the owner
 * checklist, not in a claim made here.
 *
 * This drives the real site with a real password, because a minted session
 * would skip the one call that matters (signInWithPassword). It writes
 * nothing to the member's account beyond starting a session, and signs out.
 *
 * Usage, from the repository root:
 *
 *   MEMBER_PASSWORD=... SHOTS_DIR=/path/to/shots \
 *   node apps/consumer-web-app/scripts/verify-turnstile-dormant-live.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL ?? '8weeks2fab@gmail.com';
const MEMBER_PASSWORD = process.env.MEMBER_PASSWORD;
const SHOTS = process.env.SHOTS_DIR ?? './live-shots';
mkdirSync(SHOTS, { recursive: true });

if (!MEMBER_PASSWORD) {
  console.error('MEMBER_PASSWORD is required');
  process.exit(1);
}

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}
/** An observation that is real and worth printing but is not a pass or a fail. */
function note(text) {
  console.log(`NOTE  ${text}`);
}

/**
 * Gives Cloudflare a moment to mount its widget and, if it is going to,
 * issue a token. Never throws: no token under automation is the expected
 * outcome here, not an error.
 */
async function settleWidget(page) {
  await page
    .waitForFunction(() => Boolean(document.querySelector('input[name="cf-turnstile-response"]')), {
      timeout: 20000,
    })
    .catch(() => {});
  await page.waitForTimeout(3000);
}

/** Reads what Turnstile itself put in the page. */
async function widgetState(page) {
  await settleWidget(page);
  return page.evaluate(() => {
    const gate = document.querySelector('[data-testid="turnstile-gate"]');
    const response = document.querySelector('input[name="cf-turnstile-response"]');
    return {
      gatePresent: Boolean(gate),
      scriptLoaded: typeof window.turnstile !== 'undefined',
      // Cloudflare creates this itself. Its existence proves the script ran,
      // accepted this hostname for this site key, and built a widget: a key
      // rejected for the domain never gets this far.
      widgetMounted: Boolean(response),
      tokenLength: response ? String(response.value ?? '').length : 0,
      visibleText: gate ? (gate.innerText ?? '').trim() : '',
    };
  });
}

/**
 * The three things that must be true on every protected screen, whatever
 * Turnstile decides about this particular browser.
 */
function checkScreen(label, state) {
  check(`${label}: bot check is wired in`, state.gatePresent && state.scriptLoaded);
  check(`${label}: Cloudflare accepted this site key for this domain`, state.widgetMounted);
  check(
    `${label}: member sees nothing (no stray box, no error text)`,
    state.visibleText === '',
    JSON.stringify(state.visibleText)
  );
  note(
    `${label}: token length ${state.tokenLength}` +
      (state.tokenLength === 0 ? ' (expected: headless is automation, Turnstile declined it)' : '')
  );
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

try {
  // -----------------------------------------------------------------------
  // 1. Login: wired in, invisible, and still works with no token at all
  // -----------------------------------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  check('login screen loads', page.url().includes('/login'), page.url());
  checkScreen('login', await widgetState(page));
  await page.screenshot({ path: `${SHOTS}/turnstile-login.png`, fullPage: true });

  await page.fill('#email', MEMBER_EMAIL);
  await page.fill('#password', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {});
  const landed = new URL(page.url()).pathname;
  check(
    'real password login succeeds with no token, exactly as before',
    !landed.startsWith('/login'),
    landed
  );

  const errorOnLogin = await page
    .locator('[role="alert"]')
    .first()
    .textContent()
    .catch(() => null);
  check('no error was shown during login', !errorOnLogin, errorOnLogin ?? '');
  await page.screenshot({ path: `${SHOTS}/turnstile-after-login.png`, fullPage: true });

  // -----------------------------------------------------------------------
  // 2. Change password, the screen behind that session
  // -----------------------------------------------------------------------
  await page.goto(`${BASE}/account/password`, { waitUntil: 'domcontentloaded' });
  check(
    'change password screen loads for a signed-in member',
    page.url().includes('/account/password'),
    page.url()
  );
  checkScreen('change password', await widgetState(page));

  // Sign out so the screens below are genuinely signed out.
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  const signOut = page.getByRole('button', { name: /sign out/i }).first();
  if (await signOut.count()) {
    await signOut.click();
    await page.waitForURL(/\/login/, { timeout: 30000 }).catch(() => {});
  }
  await context.clearCookies();

  // -----------------------------------------------------------------------
  // 3. Signup: loads and is still the same usable form
  // -----------------------------------------------------------------------
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
  check('signup screen loads', page.url().includes('/signup'), page.url());
  checkScreen('signup', await widgetState(page));
  check('signup still asks for email', (await page.locator('#email').count()) === 1);
  check('signup button is enabled', await page.locator('button[type="submit"]').first().isEnabled());
  await page.screenshot({ path: `${SHOTS}/turnstile-signup.png`, fullPage: true });

  // -----------------------------------------------------------------------
  // 4. Forgot password: loads, and actually submits with no token
  // -----------------------------------------------------------------------
  await page.goto(`${BASE}/reset-password`, { waitUntil: 'domcontentloaded' });
  check('forgot password screen loads', page.url().includes('/reset-password'), page.url());
  checkScreen('forgot password', await widgetState(page));

  // Submitted for real, against the standing test member's own address, so
  // the recover endpoint is proved to still accept the request while the
  // switch is off. One email, to an account the owner controls.
  await page.fill('#email', MEMBER_EMAIL);
  await page.click('button[type="submit"]');
  const status = await page
    .locator('[role="status"]')
    .first()
    .textContent({ timeout: 30000 })
    .catch(() => null);
  check(
    'forgot password submits and confirms, exactly as before',
    Boolean(status && status.includes('reset link has been sent')),
    status ?? 'no status message'
  );
  check(
    'the calm refusal message was NOT shown, because nothing refused it',
    !(status ?? '').includes('could not confirm'),
    status ?? ''
  );
  await page.screenshot({ path: `${SHOTS}/turnstile-reset-password.png`, fullPage: true });
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed} / ${results.length}`);
process.exit(passed === results.length ? 0 : 1);
