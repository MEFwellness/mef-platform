#!/usr/bin/env node
/**
 * Drives the real app for the sign-out confirmation dialog, because the
 * defect it fixes is a geometry defect: the markup was already correct and
 * the dialog still landed with its buttons off screen.
 *
 * What it measures rather than asserts:
 *   1. Both buttons' bounding boxes sit fully inside the visible viewport,
 *      on a phone-sized screen, for a member, a coach and an
 *      administrator.
 *   2. The dialog is a child of <body>, not of the profile sheet or the
 *      staff bar, which is what stops a transformed or filtered ancestor
 *      capturing its fixed positioning.
 *   3. Cancel closes it and leaves the session alive.
 *   4. Sign Out ends the session.
 *   5. Each role reads its own copy.
 *
 *   BASE=http://localhost:3000 node scripts/screenshots/verify-signout-dialog.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '/tmp/signout-dialog-shots';
mkdirSync(OUT, { recursive: true });

const USERS = {
  member: { email: 'member.one@example.test', password: 'DevPassword123!' },
  coach: { email: 'coach.one@example.test', password: 'DevPassword123!' },
  admin: { email: 'admin.one@example.test', password: 'DevPassword123!' },
};

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const browser = await chromium.launch();
// iPhone 14 dimensions, the case in the report.
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function signIn(page, user) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  return page.url();
}

/**
 * Everything about the open dialog that decides whether it is usable:
 * where its buttons are, what it says, and whose child it is.
 */
function readDialog(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('div[aria-label="Confirm sign out"]');
    if (!dialog) return { open: false };
    const buttons = Array.from(dialog.querySelectorAll('button')).map((b) => {
      const r = b.getBoundingClientRect();
      return {
        label: b.innerText.trim(),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    });
    // Whichever fixed frame the dialog actually got centered inside.
    const frame = dialog.closest('.mef-modal-viewport');
    const frameRect = frame ? frame.getBoundingClientRect() : null;
    return {
      open: true,
      body: dialog.innerText.replace(/\s+/g, ' ').trim(),
      buttons,
      // Portalled dialogs hang off <body>. If this reports the profile
      // sheet or the staff nav, the portal is gone and the bug is back.
      portalledToBody: frame ? frame.parentElement === document.body : false,
      insideTransformedAncestor: (() => {
        let el = frame ? frame.parentElement : null;
        while (el && el !== document.documentElement) {
          const s = getComputedStyle(el);
          if (s.transform !== 'none' || s.filter !== 'none' || s.backdropFilter !== 'none') {
            return el.tagName + '.' + String(el.className).slice(0, 40);
          }
          el = el.parentElement;
        }
        return null;
      })(),
      backdrop: Boolean(document.querySelector('div[aria-hidden="true"].fixed.inset-0')),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

function buttonsFullyVisible(state) {
  return (
    state.buttons.length === 2 &&
    state.buttons.every(
      (b) =>
        b.top >= 0 &&
        b.bottom <= state.viewport.height &&
        b.left >= 0 &&
        b.right <= state.viewport.width &&
        b.width > 0 &&
        b.height > 0
    )
  );
}

/** Member: the dialog opens from inside the profile sheet, the transformed ancestor. */
{
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await signIn(page, USERS.member);
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.click('button[aria-label="Profile menu"]');
  await page.waitForTimeout(900);
  await page.click('div[aria-label="Profile menu"] button:has-text("Sign Out")');
  await page.waitForTimeout(900);

  const state = await readDialog(page);
  await page.screenshot({ path: `${OUT}/member-dialog.png` });
  check('member: dialog opens', state.open === true);
  check('member: dialog is a child of <body>, not of the profile sheet', state.portalledToBody === true);
  check('member: no transformed or filtered ancestor above it', state.insideTransformedAncestor === null, String(state.insideTransformedAncestor));
  check('member: dimmed backdrop present', state.backdrop === true);
  check(
    'member: BOTH buttons fully inside the viewport',
    buttonsFullyVisible(state),
    JSON.stringify(state.buttons) + ` viewport ${state.viewport.height}px`
  );
  check('member: copy is the member wording', /check-ins, Root Score, and coaching/.test(state.body), state.body);
  check('member: no em dash in the dialog', !state.body.includes('—'), state.body);

  // Cancel keeps the session.
  await page.click('div[aria-label="Confirm sign out"] button:has-text("Cancel")');
  await page.waitForTimeout(900);
  const afterCancel = await readDialog(page);
  check('member: Cancel closes the dialog', afterCancel.open === false);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('member: still signed in after Cancel', !page.url().includes('/login'), page.url().replace(BASE, ''));

  // Backdrop tap also cancels.
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.click('button[aria-label="Profile menu"]');
  await page.waitForTimeout(900);
  await page.click('div[aria-label="Profile menu"] button:has-text("Sign Out")');
  await page.waitForTimeout(900);
  await page.mouse.click(195, 60);
  await page.waitForTimeout(900);
  const afterBackdrop = await readDialog(page);
  check('member: tapping the backdrop closes the dialog', afterBackdrop.open === false);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('member: still signed in after a backdrop tap', !page.url().includes('/login'), page.url().replace(BASE, ''));

  // Confirm ends the session.
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.click('button[aria-label="Profile menu"]');
  await page.waitForTimeout(900);
  await page.click('div[aria-label="Profile menu"] button:has-text("Sign Out")');
  await page.waitForTimeout(900);
  await page.click('div[aria-label="Confirm sign out"] button:has-text("Sign Out")');
  await page.waitForTimeout(4500);
  check('member: confirming lands on the login screen', page.url().includes('/login'), page.url().replace(BASE, ''));

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2500);
  check('member: back button cannot re-enter', page.url().includes('/login'), page.url().replace(BASE, ''));

  const back = await signIn(page, USERS.member);
  check('member: signs back in normally', back.includes('/dashboard'), back.replace(BASE, ''));

  await context.close();
}

/** Staff: the dialog opens from inside the nav bar, the backdrop-filtered ancestor. */
for (const [role, user, home, expectedCopy] of [
  ['coach', USERS.coach, '/coach', /manage your clients/],
  ['admin', USERS.admin, '/admin', /manage the platform/],
]) {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await signIn(page, user);
  await page.goto(`${BASE}${home}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  await page.click('nav[aria-label="Staff"] button');
  await page.waitForTimeout(900);

  const state = await readDialog(page);
  await page.screenshot({ path: `${OUT}/${role}-dialog.png` });
  check(`${role}: dialog opens`, state.open === true);
  check(`${role}: dialog is a child of <body>, not of the staff bar`, state.portalledToBody === true);
  check(`${role}: no transformed or filtered ancestor above it`, state.insideTransformedAncestor === null, String(state.insideTransformedAncestor));
  check(
    `${role}: BOTH buttons fully inside the viewport`,
    buttonsFullyVisible(state),
    JSON.stringify(state.buttons) + ` viewport ${state.viewport.height}px`
  );
  check(`${role}: copy is the ${role} wording`, expectedCopy.test(state.body), state.body);
  check(`${role}: no member language in the dialog`, !/check-ins, Root Score/.test(state.body), state.body);
  check(`${role}: no em dash in the dialog`, !state.body.includes('—'), state.body);

  await page.click('div[aria-label="Confirm sign out"] button:has-text("Cancel")');
  await page.waitForTimeout(900);
  check(`${role}: Cancel closes the dialog`, (await readDialog(page)).open === false);
  await page.goto(`${BASE}${home}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check(`${role}: still signed in after Cancel`, !page.url().includes('/login'), page.url().replace(BASE, ''));

  await page.click('nav[aria-label="Staff"] button');
  await page.waitForTimeout(900);
  await page.click('div[aria-label="Confirm sign out"] button:has-text("Sign Out")');
  await page.waitForTimeout(4500);
  check(`${role}: confirming lands on the login screen`, page.url().includes('/login'), page.url().replace(BASE, ''));

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2500);
  check(`${role}: back button cannot re-enter`, page.url().includes('/login'), page.url().replace(BASE, ''));

  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
