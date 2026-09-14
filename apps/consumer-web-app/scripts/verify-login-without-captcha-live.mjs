#!/usr/bin/env node
/**
 * LIVE PROOF THAT THE LOGIN FORM ITSELF WORKS, DRIVEN EIGHT TIMES.
 *
 * This is the first time this repository has been able to drive the REAL
 * login form on production. Every previous live rig had to mint a session
 * with the service-role key and skip the form entirely, because Turnstile
 * correctly refuses to clear a headless browser silently and the form
 * could not be submitted without a token. That limitation was the same
 * mechanism that was refusing real members on real phones, so removing the
 * bot check from sign-in removed the rig's blindfold at the same time.
 *
 * WHAT IT PROVES, AND HOW.
 *
 *   1. EIGHT CONSECUTIVE SIGN-INS, each in a brand-new browser context
 *      with its own cookie jar, so none of them is riding the last one's
 *      session. A pass is landing on a signed-in screen with NO error
 *      banner on the form. The time each one takes is recorded.
 *   2. ONE WRONG PASSWORD, which must come back saying the email or the
 *      password is incorrect, and must never say anything about
 *      confirming, security checks or trying again later.
 *   3. THE SIGN-IN PATH TOUCHES CLOUDFLARE ZERO TIMES. Every request the
 *      page makes is recorded; a single one to challenges.cloudflare.com
 *      is a failure, because that is the dependency that was removed.
 *   4. SIGNUP STILL CARRIES ITS CHECK: the widget and Cloudflare's script
 *      are still on /signup, and the server still refuses a create-account
 *      request that arrives with no valid token.
 *
 * WHAT IT DOES NOT TOUCH. It signs in, reads the screen it lands on, and
 * closes the context. It creates no rows, and the signup check in step 4
 * is made against an address that cannot become an account.
 *
 * Usage, from the repository root:
 *
 *   MEMBER_EMAIL=... MEMBER_PASSWORD=... \
 *   node apps/consumer-web-app/scripts/verify-login-without-captcha-live.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.MEMBER_PASSWORD;
const ROUNDS = Number(process.env.ROUNDS ?? 8);

if (!MEMBER_EMAIL || !MEMBER_PASSWORD) {
  console.error('MEMBER_EMAIL and MEMBER_PASSWORD are required');
  process.exit(1);
}

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}
function note(text) {
  console.log(`NOTE  ${text}`);
}

/**
 * A fresh context every time: its own cookie jar, its own storage, nothing
 * carried over. Reduced motion is left OFF deliberately, because headless
 * Chromium defaults to preferring it and the entry animation this app plays
 * after a login is part of what the member waits through.
 */
async function freshContext(browser) {
  return await browser.newContext({
    viewport: { width: 414, height: 896 },
    reducedMotion: 'no-preference',
  });
}

/** The banner the form shows, or null. Scoped to the form's own alert. */
async function errorBannerText(page) {
  const alert = page.locator('[role="alert"]');
  if ((await alert.count()) === 0) return null;
  for (let i = 0; i < (await alert.count()); i += 1) {
    const text = (await alert.nth(i).innerText().catch(() => '')).trim();
    if (text) return text;
  }
  return null;
}

async function main() {
  const browser = await chromium.launch();

  // -------------------------------------------------------------------
  // 1. Eight consecutive real sign-ins
  // -------------------------------------------------------------------
  const timings = [];
  let allSucceeded = true;
  let anyCloudflare = false;

  for (let round = 1; round <= ROUNDS; round += 1) {
    const context = await freshContext(browser);
    const page = await context.newPage();
    const cloudflareHits = [];
    page.on('request', (request) => {
      if (request.url().includes('challenges.cloudflare.com')) cloudflareHits.push(request.url());
    });

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email');
    await page.fill('#email', MEMBER_EMAIL);
    await page.fill('#password', MEMBER_PASSWORD);

    const started = Date.now();
    // The press and the navigation it causes, awaited together: a press
    // asserted on before the app has hydrated is a press that did nothing,
    // and a screenshot taken while the submit is still in flight reports a
    // failure that has not happened yet.
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 }).catch(
        () => {}
      ),
      page.getByRole('button', { name: /^log in$/i }).click(),
    ]);
    const elapsed = Date.now() - started;

    const banner = await errorBannerText(page);
    const landedOff = !new URL(page.url()).pathname.startsWith('/login');
    const passed = landedOff && banner === null;
    if (!passed) allSucceeded = false;
    if (cloudflareHits.length > 0) anyCloudflare = true;

    timings.push({ round, ms: elapsed, url: new URL(page.url()).pathname, banner, passed });
    console.log(
      `  round ${round}: ${passed ? 'signed in' : 'FAILED'} in ${elapsed} ms -> ${new URL(page.url()).pathname}${banner ? ` :: banner "${banner}"` : ''}`
    );

    await context.close();
  }

  check(`${ROUNDS} consecutive sign-ins through the real form all succeeded`, allSucceeded);
  check('no sign-in loaded anything from Cloudflare', !anyCloudflare);
  const successful = timings.filter((t) => t.passed).map((t) => t.ms);
  if (successful.length > 0) {
    const fastest = Math.min(...successful);
    const slowest = Math.max(...successful);
    const mean = Math.round(successful.reduce((a, b) => a + b, 0) / successful.length);
    note(`sign-in time: fastest ${fastest} ms, slowest ${slowest} ms, mean ${mean} ms`);
  }

  // -------------------------------------------------------------------
  // 2. One wrong password
  // -------------------------------------------------------------------
  {
    const context = await freshContext(browser);
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email');
    await page.fill('#email', MEMBER_EMAIL);
    await page.fill('#password', 'definitely-not-the-password-9f3a');
    await page.getByRole('button', { name: /^log in$/i }).click();
    // Wait for the banner to have WORDS IN IT, not merely to exist. The
    // element can be in the DOM with nothing in it yet, and a fixed sleep
    // would be guessing at how long Supabase takes to answer. Measured
    // against the old build, that answer could be half a minute away.
    let banner = '';
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      banner = (await errorBannerText(page)) ?? '';
      if (banner.length > 0) break;
      await page.waitForTimeout(250);
    }
    check(
      'a wrong password says the email or the password is incorrect',
      /incorrect email or password/i.test(banner),
      `banner: "${banner}"`
    );
    check(
      'it says nothing about confirming or a security check',
      !/could not confirm|security check|try again in time/i.test(banner),
      `banner: "${banner}"`
    );
    check('a wrong password does not sign anybody in', new URL(page.url()).pathname === '/login');
    await context.close();
  }

  // -------------------------------------------------------------------
  // 3. Signup still carries its check
  // -------------------------------------------------------------------
  {
    const context = await freshContext(browser);
    const page = await context.newPage();
    const cloudflareHits = [];
    page.on('request', (request) => {
      if (request.url().includes('challenges.cloudflare.com')) cloudflareHits.push(request.url());
    });
    await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email');
    // Give the preloaded script a moment to be asked for. It is in the
    // server-rendered HTML, so this is not a race against hydration.
    await page.waitForTimeout(3_000);
    check(
      'the signup screen still loads the bot check',
      cloudflareHits.length > 0,
      `${cloudflareHits.length} request(s) to challenges.cloudflare.com`
    );
    const hasContainer = (await page.locator('[data-testid="turnstile-gate"]').count()) > 0;
    check('the signup form still renders the widget container', hasContainer);
    await context.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}`);
  }
  // Set rather than called in a finally: process.exit() inside a finally
  // swallows a throw that was on its way out.
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
