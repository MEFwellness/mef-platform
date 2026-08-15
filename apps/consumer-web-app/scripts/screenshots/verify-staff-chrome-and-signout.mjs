#!/usr/bin/env node
/**
 * Drives the real app for the admin/coach chrome cleanup and the new Sign
 * Out, because neither defect is visible to a source scan: both are about
 * what actually renders on a phone.
 *
 * Runs against a local dev server + local Supabase by default, using the
 * seeded accounts. The seeded administrator (admin.one) holds
 * platform_administrator and NOT coach, which is precisely the account
 * that used to get the member bottom bar under the admin screens.
 *
 *   BASE=http://localhost:3000 node scripts/screenshots/verify-staff-chrome-and-signout.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '/tmp/staff-chrome-shots';
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

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  return { context, page: await context.newPage() };
}

async function signIn(page, user) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  return page.url();
}

/** What navigation is actually on screen right now. */
async function navState(page) {
  return page.evaluate(() => {
    const member = document.querySelector('nav[aria-label="Primary"]');
    const staff = document.querySelector('nav[aria-label="Staff"]');
    const text = (n) => (n ? n.innerText.replace(/\s+/g, ' ').trim() : null);
    return {
      memberBar: text(member),
      staffBar: text(staff),
      checkInButton: Boolean(document.querySelector('a[aria-label="Check In"]')),
    };
  });
}

// ---------------------------------------------------------------- ADMIN
{
  const { context, page } = await freshPage();
  const landed = await signIn(page, USERS.admin);
  check('administrator signs in and lands on /admin', landed.includes('/admin'), landed.replace(BASE, ''));

  for (const route of ['/admin', '/admin/access', '/admin/analytics', '/admin/cvs-test-tools']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const nav = await navState(page);
    check(`${route}: member bottom bar absent`, nav.memberBar === null, String(nav.memberBar));
    check(`${route}: no gold Check-In button`, nav.checkInButton === false);
    check(`${route}: staff bar present`, nav.staffBar !== null, String(nav.staffBar));
    check(`${route}: staff bar has Admin + Sign Out and no member tab`,
      /ADMIN/i.test(nav.staffBar ?? '') &&
        /SIGN OUT/i.test(nav.staffBar ?? '') &&
        !/FOOD LENS|PROGRESS|TODAY|CHECK-IN/i.test(nav.staffBar ?? ''),
      String(nav.staffBar));
  }

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/admin-home.png`, fullPage: false });

  // Sign out from the staff bar, then try to walk back in.
  await page.click('nav[aria-label="Staff"] button');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/admin-signout-confirm.png` });
  await page.click('div[role="dialog"] button:has-text("Sign Out")');
  await page.waitForTimeout(4000);
  check('administrator lands on /login after signing out', page.url().includes('/login'), page.url().replace(BASE, ''));
  await page.screenshot({ path: `${OUT}/admin-after-signout.png` });

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2500);
  const backUrl = page.url();
  const backBody = await page.evaluate(() => document.body.innerText.slice(0, 400));
  check('back button does not re-enter the admin app', backUrl.includes('/login'), backUrl.replace(BASE, ''));
  check('back button screen shows no admin content', !/User management|Member access/i.test(backBody));

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  check('typing /admin after sign out bounces to /login', page.url().includes('/login'), page.url().replace(BASE, ''));

  await context.close();
}

// ---------------------------------------------------------------- COACH
{
  const { context, page } = await freshPage();
  const landed = await signIn(page, USERS.coach);
  check('coach signs in and lands on /coach', landed.includes('/coach'), landed.replace(BASE, ''));

  for (const route of ['/coach', '/coach/programs', '/coach/questions']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const nav = await navState(page);
    check(`${route}: member bottom bar absent`, nav.memberBar === null, String(nav.memberBar));
    check(`${route}: staff bar has Coach + Sign Out`,
      /COACH/i.test(nav.staffBar ?? '') && /SIGN OUT/i.test(nav.staffBar ?? ''),
      String(nav.staffBar));
    check(`${route}: staff bar offers no Admin tab to a non-admin`,
      !/ADMIN/i.test(nav.staffBar ?? ''), String(nav.staffBar));
  }

  await page.goto(`${BASE}/coach`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/coach-home.png` });

  await page.click('nav[aria-label="Staff"] button');
  await page.waitForTimeout(600);
  await page.click('div[role="dialog"] button:has-text("Sign Out")');
  await page.waitForTimeout(4000);
  check('coach lands on /login after signing out', page.url().includes('/login'), page.url().replace(BASE, ''));

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2500);
  check('back button does not re-enter the coach app', page.url().includes('/login'), page.url().replace(BASE, ''));

  await context.close();
}

// --------------------------------------------------------------- MEMBER
{
  const { context, page } = await freshPage();
  const landed = await signIn(page, USERS.member);
  check('member signs in and lands on the member Home', landed.includes('/dashboard'), landed.replace(BASE, ''));

  for (const route of ['/dashboard', '/today', '/progress', '/food-lens']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const nav = await navState(page);
    check(`${route}: member bottom bar present with all five destinations`,
      nav.memberBar !== null &&
        /HOME/i.test(nav.memberBar) &&
        /FOOD LENS/i.test(nav.memberBar) &&
        /CHECK-IN/i.test(nav.memberBar) &&
        /PROGRESS/i.test(nav.memberBar) &&
        /TODAY/i.test(nav.memberBar),
      String(nav.memberBar));
    check(`${route}: gold Check-In button still there`, nav.checkInButton === true);
    check(`${route}: no staff bar for a member`, nav.staffBar === null, String(nav.staffBar));
  }

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/member-home.png` });

  // The member's own Sign Out: avatar, top right, then the profile sheet.
  await page.click('button[aria-label="Profile menu"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/member-profile-sheet.png` });
  const sheetText = await page.evaluate(() => document.body.innerText);
  check('member profile sheet offers Sign Out', /Sign Out/i.test(sheetText));

  await page.click('div[role="dialog"] button:has-text("Sign Out"), button:has-text("Sign Out")');
  await page.waitForTimeout(800);
  await page.click('div[aria-label="Confirm sign out"] button:has-text("Sign Out")');
  await page.waitForTimeout(4000);
  check('member lands on /login after signing out', page.url().includes('/login'), page.url().replace(BASE, ''));

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2500);
  const backBody = await page.evaluate(() => document.body.innerText.slice(0, 400));
  check('back button does not re-enter the member app', page.url().includes('/login'), page.url().replace(BASE, ''));
  check('back button screen shows no member content', !/Root Score|Daily Reset/i.test(backBody));

  const again = await signIn(page, USERS.member);
  check('member can sign back in normally', again.includes('/dashboard'), again.replace(BASE, ''));

  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
