#!/usr/bin/env node
// Live verification for the branded "Reset" entry animation against
// production. Mirrors login()/config.mjs the same way
// verify-dashboard-evolution-live.mjs and verify-root-presence-live.mjs do.
//
// Usage: SCREENSHOT_TARGET=live node scripts/screenshots/verify-entry-animation-live.mjs
import { chromium } from 'playwright';
import { ACCOUNTS, BASE_URL, VIEWPORT } from './config.mjs';
import { login } from './lib.mjs';

const OVERLAY_SELECTOR = 'div[aria-hidden="true"].fixed.inset-0';
const consoleIssues = [];

function attachListeners(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleIssues.push({ label, type: 'console.error', text: msg.text(), url: page.url() });
  });
  page.on('pageerror', (err) => consoleIssues.push({ label, type: 'pageerror', text: err.message, url: page.url() }));
}

async function main() {
  console.log(`Verifying the branded Reset entry animation against ${BASE_URL}\n`);
  const browser = await chromium.launch();
  const account = ACCOUNTS.memberPopulated;

  // ---- Fresh login: full animation, no dashboard flash ----
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    attachListeners(page, 'fresh-login');
    await login(page, BASE_URL, account);

    console.log('--- Fresh login ---');
    console.log('final URL after login:', page.url());

    await page.waitForTimeout(300);
    const overlayEarly = await page.locator(OVERLAY_SELECTOR).first().isVisible().catch(() => false);
    console.log('overlay visible early in the sequence (should be true):', overlayEarly);

    const bodyDuringOverlay = await page.evaluate(() => document.body.innerText);
    console.log('welcome line present:', /Welcome back/.test(bodyDuringOverlay));
    console.log('em dash present in visible text (should be false):', bodyDuringOverlay.includes('—'));

    await page.waitForTimeout(4000);
    const overlayGone = await page.locator(OVERLAY_SELECTOR).count();
    console.log('overlay element count after ~4.3s total (should be 0):', overlayGone);

    const dashboardText = await page.evaluate(() => document.body.innerText);
    console.log('landed on real dashboard content (has "Root Score"):', /Root Score/i.test(dashboardText));

    // ---- Internal navigation must not replay ----
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    console.log('overlay count on /profile after navigating (should be 0):', await page.locator(OVERLAY_SELECTOR).count());

    await page.goto(`${BASE_URL}/progress`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    console.log('overlay count on /progress after navigating (should be 0):', await page.locator(OVERLAY_SELECTOR).count());

    // ---- Hard reload must not replay ----
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    console.log('overlay count after hard reload (should be 0):', await page.locator(OVERLAY_SELECTOR).count());

    // ---- Logout then login must replay ----
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'load' });
    await page.click('button:has-text("Sign Out")');
    await page.waitForTimeout(300);
    await Promise.all([
      page.waitForURL(/\/login/, { timeout: 15000 }),
      page.click('div[role="dialog"] button:has-text("Sign Out")'),
    ]);
    console.log('signed out, now at:', page.url());

    await login(page, BASE_URL, account);
    await page.waitForTimeout(300);
    const overlayAfterRelogin = await page.locator(OVERLAY_SELECTOR).first().isVisible().catch(() => false);
    console.log('overlay visible after logout -> login (should be true):', overlayAfterRelogin);
    await page.waitForTimeout(4000);

    await context.close();
  }

  // ---- Deep link: signed-out visit to a protected page lands back there after login ----
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    attachListeners(page, 'deep-link');
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'load' });
    console.log('\n--- Deep link ---');
    console.log('redirected to (should carry redirectedFrom=/profile):', page.url());
    await page.locator('#email').fill(account.email);
    await page.locator('#password').fill(account.password);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 }),
      page.getByRole('button', { name: 'Log in' }).click(),
    ]);
    console.log('final URL after login (should be /profile, not forced to /dashboard):', page.url());
    await context.close();
  }

  // ---- Reduced motion ----
  {
    const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
    const page = await context.newPage();
    attachListeners(page, 'reduced-motion');
    await login(page, BASE_URL, account);
    const t0 = Date.now();
    let lastSeen = 0;
    while (Date.now() - t0 < 3000) {
      const count = await page.locator(OVERLAY_SELECTOR).count();
      if (count > 0) lastSeen = Date.now() - t0;
      else if (lastSeen > 0) break;
      await page.waitForTimeout(50);
    }
    console.log('\n--- Reduced motion ---');
    console.log('overlay lastSeen ms (should be roughly 1000-1600, well under 4s):', lastSeen);
    await context.close();
  }

  console.log('\nConsole/page errors across every context:', consoleIssues.length ? consoleIssues : 'none');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
