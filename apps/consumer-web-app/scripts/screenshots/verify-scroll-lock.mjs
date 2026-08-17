#!/usr/bin/env node
/**
 * Drives the real app to prove the page can still be scrolled, because the
 * defect this guards against is a behavioural one that no amount of correct
 * markup can rule out: a modal pinned `<body>` with `position: fixed` and
 * the pin outlived the modal, so every screen became unscrollable until a
 * full reload.
 *
 * What it measures rather than asserts:
 *   1. Every member screen scrolls on a fresh load.
 *   2. The Root pop-up chain pins the page while it is open (it should),
 *      and releases it the moment it closes.
 *   3. The sign-out confirmation pins while open and releases on Cancel,
 *      on a backdrop tap, and on Escape.
 *   4. Scrolling still works after in-app navigation, not only after a
 *      hard reload — the stranded-lock bug survived client-side navigation,
 *      which is what made it look like "the whole app".
 *   5. All of the above at iPhone SE width, the narrowest real phone.
 *
 *   BASE=http://localhost:3000 node scripts/screenshots/verify-scroll-lock.mjs
 *
 * The production twin is scripts/screenshots/verify-scroll-lock-live.mjs.
 * The unit-level guard is tests/body-scroll-lock.test.ts.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '/tmp/scroll-lock-shots';
mkdirSync(OUT, { recursive: true });

const USER = {
  email: process.env.SCROLL_EMAIL ?? 'member.one@example.test',
  password: process.env.SCROLL_PASSWORD ?? 'DevPassword123!',
};

const SCREENS = ['/dashboard', '/today', '/progress', '/food-lens', '/checkin', '/case'];

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/**
 * The two things that decide whether a member can scroll: whether the body
 * is pinned, and whether the page actually moves when asked. A page shorter
 * than the viewport genuinely has nothing to scroll, so that is reported as
 * its own state rather than counted as a failure.
 */
async function readScrollState(page) {
  const read = () =>
    page.evaluate(() => ({
      pinned: document.body.style.position === 'fixed' || document.body.style.overflow === 'hidden',
      docHeight: document.documentElement.scrollHeight,
      viewport: document.documentElement.clientHeight,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    }));
  const before = await read();
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  const moved = await page.evaluate(() => window.scrollY);
  // Read again AFTER scrolling: components/wearables/WearableWelcomeModal.tsx
  // reveals itself once the member scrolls past 55% of the viewport, so the
  // probe itself can summon a modal that then legitimately pins the page.
  const after = await read();
  await page.evaluate(() => window.scrollTo(0, 0));
  return {
    ...before,
    dialogsAfter: after.dialogs,
    pinnedAfter: after.pinned,
    moved,
    taller: before.docHeight > before.viewport + 20,
  };
}

/**
 * A page with a modal on it is supposed to be pinned, so this closes
 * whatever is open first and measures the bare page — including a modal
 * that only appeared because of the scroll.
 */
async function expectScrolls(page, label) {
  if (await page.locator('[role="dialog"]').count()) await dismissRootPopup(page);
  let s = await readScrollState(page);
  if (s.dialogsAfter > 0) {
    await dismissRootPopup(page);
    s = await readScrollState(page);
  }
  const ok = !s.pinned && !s.pinnedAfter && (!s.taller || s.moved > 0);
  check(
    `${label}: page scrolls`,
    ok,
    `pinned=${s.pinned} scrollY=${s.moved} doc=${s.docHeight}/${s.viewport}` +
      `${s.taller ? '' : ' (page fits viewport)'}${s.dialogsAfter ? ` dialogsAfterScroll=${s.dialogsAfter}` : ''}`
  );
  return ok;
}

async function expectPinned(page, label) {
  const s = await readScrollState(page);
  check(`${label}: page correctly pinned while open`, s.pinned && s.moved === 0, `pinned=${s.pinned} scrollY=${s.moved}`);
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', USER.email);
  await page.fill('input[type="password"]', USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|today|onboarding|welcome/, { timeout: 60000 }).catch(() => {});
  // The branded entry animation owns the screen for ~3.6s after a login.
  await page.waitForTimeout(8000);
  return page.url();
}

/** Clicks whatever this pop-up offers as a way out, until it is gone. */
async function dismissRootPopup(page) {
  // Case-insensitive on purpose: the wearable welcome modal says "Maybe
  // Later" and the Root pop-up chain says "Maybe later", and a script that
  // cannot close a modal reads as a scroll bug that is not there.
  const LABELS = [/^close$/i, /^ignore$/i, /^got it$/i, /^not now$/i, /^maybe later$/i, /^done$/i];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.count())) return true;
    let clicked = false;
    for (const label of LABELS) {
      const button = dialog.getByRole('button', { name: label });
      if (await button.count()) {
        await button.first().click({ timeout: 5000 }).catch(() => {});
        clicked = true;
        break;
      }
    }
    if (!clicked) return false;
    await page.waitForTimeout(2500);
  }
  return !(await page.locator('[role="dialog"]').count());
}

async function runSignOutDialogChecks(page, tag) {
  const openers = page.getByRole('button', { name: 'Sign Out', exact: true });
  if (!(await openers.count())) {
    check(`${tag} sign-out dialog reachable`, false, 'no Sign Out button on screen');
    return;
  }

  for (const [how, close] of [
    ['Cancel', async () => page.getByRole('button', { name: 'Cancel', exact: true }).first().click()],
    ['Escape', async () => page.keyboard.press('Escape')],
    ['backdrop tap', async () => page.mouse.click(10, 10)],
  ]) {
    await openers.first().click();
    await page.waitForTimeout(700);
    const open = await page.locator('div[aria-label="Confirm sign out"]').count();
    check(`${tag} sign-out dialog opens (${how})`, open === 1);
    await expectPinned(page, `${tag} sign-out dialog open (${how})`);

    await close();
    await page.waitForTimeout(700);
    const stillOpen = await page.locator('div[aria-label="Confirm sign out"]').count();
    check(`${tag} sign-out dialog closes on ${how}`, stillOpen === 0);
    await expectScrolls(page, `${tag} after sign-out ${how}`);
  }
}

async function runViewport(browser, name, viewport) {
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  PAGEERROR (${name}):`, e.message));

  const landed = await signIn(page);
  check(`${name} signed in`, /dashboard|today/.test(landed), landed);
  await page.screenshot({ path: `${OUT}/${name}-01-after-login.png` });

  // A pop-up may or may not be waiting today. Both are real states.
  if (await page.locator('[role="dialog"]').count()) {
    const text = ((await page.locator('[role="dialog"]').first().textContent()) ?? '')
      .replace(/\s+/g, ' ')
      .slice(0, 60);
    await expectPinned(page, `${name} Root pop-up open`);
    const gone = await dismissRootPopup(page);
    check(`${name} Root pop-up closes ("${text}")`, gone);
    await page.screenshot({ path: `${OUT}/${name}-02-popup-closed.png` });
    await expectScrolls(page, `${name} after Root pop-up closed`);
  } else {
    console.log(`  (${name}) no Root pop-up waiting on this account today`);
    await expectScrolls(page, `${name} after login, no pop-up`);
  }

  for (const path of SCREENS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await expectScrolls(page, `${name} hard load ${path}`);
  }

  // In-app navigation, which is how the stranded lock spread across screens.
  // Home may be showing the next message in the pop-up chain by now — a
  // member would close it before tapping the bar, so this does too.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (await page.locator('[role="dialog"]').count()) {
    const gone = await dismissRootPopup(page);
    check(`${name} second Root pop-up closes`, gone);
    await expectScrolls(page, `${name} after second Root pop-up closed`);
  }
  const navLink = page.locator('a[href="/today"]').first();
  if (await navLink.count()) {
    await navLink.click();
    await page.waitForTimeout(2500);
    await expectScrolls(page, `${name} after in-app nav to Today`);
  }

  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (await page.locator('[role="dialog"]').count()) await dismissRootPopup(page);
  await runSignOutDialogChecks(page, name);
  await page.screenshot({ path: `${OUT}/${name}-03-profile.png` });

  await ctx.close();
}

const browser = await chromium.launch();
try {
  await runViewport(browser, 'iphone14', { width: 390, height: 844 });
  await runViewport(browser, 'iphonese', { width: 375, height: 667 });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) {
  for (const f of failed) console.log(`  FAILED: ${f.name}  ${f.detail}`);
  process.exitCode = 1;
}
