#!/usr/bin/env node
/**
 * Live verification, against production, for the admin/coach chrome
 * cleanup and Sign Out.
 *
 * Two halves, because there are two things to prove.
 *
 *   MEMBER, unchanged, driven through the real login form: the member
 *   bottom bar still offers all five destinations, every member screen is
 *   still reachable, Sign Out is findable, using it lands on the login
 *   screen, the back button cannot get back in, and the account signs
 *   back in normally afterwards.
 *
 *   STAFF, fixed. A real session is minted for a production account that
 *   actually holds platform_administrator (and separately for one holding
 *   coach), and the admin/coach screens are checked for the thing that was
 *   wrong on a phone: the member bar must be absent, the staff bar present
 *   with the account's own destinations, and Sign Out visible on it.
 *
 * NOTHING SECRET IS PASSED ON A COMMAND LINE OR PRINTED. Same discipline
 * as scripts/screenshots/verify-role-based-home-routing-live.mjs, whose
 * session-minting approach this reuses: the staff session comes from a
 * one-time magic-link token through the Auth Admin API, so no staff
 * password is read, needed or changed.
 *
 * Usage, from apps/consumer-web-app:
 *   MEMBER_EMAIL=... MEMBER_PW_FILE=/secure/pw.txt \
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=/secure/key.txt \
 *   PROD_ANON_KEY_FILE=/secure/anon.txt \
 *     node scripts/screenshots/verify-staff-chrome-and-signout-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker.js');
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url.js');

const BASE = 'https://app.mefwellness.com';
const OUT = process.env.OUT ?? '/tmp/staff-chrome-live';
mkdirSync(OUT, { recursive: true });

const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const MEMBER_PW_FILE = process.env.MEMBER_PW_FILE;
const SUPABASE_URL = process.env.PROD_SUPABASE_URL;
const SERVICE_KEY_FILE = process.env.PROD_SERVICE_KEY_FILE;

if (!MEMBER_EMAIL || !MEMBER_PW_FILE || !SUPABASE_URL || !SERVICE_KEY_FILE) {
  console.error(
    'Set MEMBER_EMAIL, MEMBER_PW_FILE, PROD_SUPABASE_URL and PROD_SERVICE_KEY_FILE ' +
      '(the last two as file PATHS, never the secrets themselves).'
  );
  process.exit(2);
}

const MEMBER_PASSWORD = readFileSync(MEMBER_PW_FILE, 'utf8').trim();
const SERVICE_KEY = readFileSync(SERVICE_KEY_FILE, 'utf8').trim();
const ANON_KEY = process.env.PROD_ANON_KEY_FILE
  ? readFileSync(process.env.PROD_ANON_KEY_FILE, 'utf8').trim()
  : null;

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const browser = await chromium.launch();
const PHONE = { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true };

/** What navigation is actually painted on the screen right now. */
function readNav(page) {
  return page.evaluate(() => {
    const text = (n) => (n ? n.innerText.replace(/\s+/g, ' ').trim() : null);
    const hrefs = (sel) =>
      Array.from(document.querySelectorAll(sel)).map((a) => a.getAttribute('href'));
    return {
      memberBar: text(document.querySelector('nav[aria-label="Primary"]')),
      memberHrefs: hrefs('nav[aria-label="Primary"] a'),
      staffBar: text(document.querySelector('nav[aria-label="Staff"]')),
      staffHrefs: hrefs('nav[aria-label="Staff"] a'),
      checkInButton: Boolean(document.querySelector('a[aria-label="Check In"]')),
    };
  });
}

// ---------------------------------------------------------------- member
{
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(7000);
  check('member signs in', !page.url().includes('/login'), page.url().replace(BASE, ''));

  // /checkin is listed to prove it is still reachable, but it is NOT
  // expected to show the bar: the check-in wizard has always hidden the
  // bottom navigation for the length of a focused flow.
  const BAR_EXPECTED = new Set(['/dashboard', '/today', '/progress', '/food-lens']);
  for (const route of ['/dashboard', '/today', '/progress', '/food-lens', '/checkin']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const nav = await readNav(page);
    check(`member reaches ${route}`, page.url().replace(BASE, '').startsWith(route), page.url().replace(BASE, ''));
    if (BAR_EXPECTED.has(route)) {
      // Asserted on hrefs, not labels: CSS uppercases the labels.
      const complete = ['/dashboard', '/food-lens', '/checkin', '/progress', '/today'].every((h) =>
        nav.memberHrefs.includes(h)
      );
      check(`${route}: member bottom bar has all five destinations`, complete, nav.memberHrefs.join(' '));
    }
    check(`${route}: no staff bar on a member screen`, nav.staffBar === null, String(nav.staffBar));
  }

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/live-member-home.png` });

  // Sign Out, from the same profile avatar that sits at the top right of
  // every primary member screen. Driven from Today rather than Home only
  // because this account currently has a Root pop-up covering Home, and
  // dismissing it would change the account's own state for no reason.
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.click('button[aria-label="Profile menu"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/live-member-profile-sheet.png` });
  const sheet = await page.locator('body').innerText();
  check('member profile sheet offers Sign Out', /Sign Out/i.test(sheet));

  await page.click('button:has-text("Sign Out")');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/live-member-signout-confirm.png` });
  await page.click('div[aria-label="Confirm sign out"] button:has-text("Sign Out")');
  await page.waitForTimeout(7000);
  check('member lands on the login screen after signing out', page.url().includes('/login'), page.url().replace(BASE, ''));
  await page.screenshot({ path: `${OUT}/live-member-after-signout.png` });

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(5000);
  const backBody = await page.locator('body').innerText();
  check('back button does not re-enter the app', page.url().includes('/login'), page.url().replace(BASE, ''));
  check('back button screen shows no member content', !/Root Score|Priority|Good (morning|afternoon|evening)/i.test(backBody));
  await page.screenshot({ path: `${OUT}/live-member-after-back.png` });

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  check('typing /dashboard after signing out bounces to the login screen', page.url().includes('/login'), page.url().replace(BASE, ''));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(7000);
  check('member signs back in normally', !page.url().includes('/login'), page.url().replace(BASE, ''));

  await context.close();
}

// ----------------------------------------------------------------- staff
const { data: roleRows, error: roleError } = await service
  .from('user_roles')
  .select('user_id, role')
  .in('role', ['coach', 'platform_administrator'])
  .is('revoked_at', null);
if (roleError) throw new Error(`role lookup failed: ${roleError.message}`);

const byUser = new Map();
for (const row of roleRows ?? []) {
  const entry = byUser.get(row.user_id) ?? { isCoach: false, isAdmin: false };
  if (row.role === 'coach') entry.isCoach = true;
  if (row.role === 'platform_administrator') entry.isAdmin = true;
  byUser.set(row.user_id, entry);
}

/**
 * The account that reproduced the defect is an administrator who does NOT
 * also hold the coach grant: that is the one whose pages passed
 * `isCoach: false` and got the member bar. Tested first and by name.
 */
const targets = [];
const adminOnly = [...byUser.entries()].find(([, r]) => r.isAdmin && !r.isCoach);
const anyCoach = [...byUser.entries()].find(([, r]) => r.isCoach);
if (adminOnly) targets.push({ userId: adminOnly[0], roles: adminOnly[1], home: '/admin', label: 'admin-only' });
if (anyCoach) targets.push({ userId: anyCoach[0], roles: anyCoach[1], home: '/coach', label: 'coach' });
check('found the admin-only account that reproduced the defect', Boolean(adminOnly));

for (const target of targets) {
  const { data: userRow } = await service.auth.admin.getUserById(target.userId);
  const email = userRow?.user?.email;
  if (!email) {
    check(`${target.label}: account has an email`, false);
    continue;
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !link?.properties?.hashed_token) {
    check(`${target.label}: mint a session`, false, linkError?.message ?? 'no token');
    continue;
  }
  const publicClient = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyError } = await publicClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError || !verified?.session) {
    check(`${target.label}: mint a session`, false, verifyError?.message ?? 'no session');
    continue;
  }
  check(`${target.label}: mint a session`, true);

  const encoded = `base64-${stringToBase64URL(JSON.stringify(verified.session))}`;
  const chunks = createChunks(COOKIE_NAME, encoded);
  const context = await browser.newContext(PHONE);
  await context.addCookies(
    chunks.map((chunk) => ({
      name: chunk.name,
      value: chunk.value,
      domain: 'app.mefwellness.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    }))
  );
  const page = await context.newPage();

  const routes = target.home === '/admin'
    ? ['/admin', '/admin/access', '/admin/analytics', '/admin/analytics/members']
    : ['/coach', '/coach/programs', '/coach/questions'];

  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    const nav = await readNav(page);
    check(`${target.label} ${route}: MEMBER bottom bar absent`, nav.memberBar === null, String(nav.memberBar));
    check(`${target.label} ${route}: no gold Check-In button`, nav.checkInButton === false);
    check(`${target.label} ${route}: staff bar present`, nav.staffBar !== null, String(nav.staffBar));
    check(`${target.label} ${route}: Sign Out visible on the staff bar`, /SIGN OUT/i.test(nav.staffBar ?? ''), String(nav.staffBar));
    check(
      `${target.label} ${route}: staff bar carries only staff destinations`,
      nav.staffHrefs.every((h) => h === '/coach' || h === '/admin'),
      nav.staffHrefs.join(' ')
    );
    check(
      `${target.label} ${route}: staff bar matches the roles this account holds`,
      nav.staffHrefs.includes('/admin') === target.roles.isAdmin &&
        nav.staffHrefs.includes('/coach') === target.roles.isCoach,
      `${nav.staffHrefs.join(' ')} for isAdmin=${target.roles.isAdmin} isCoach=${target.roles.isCoach}`
    );
  }

  await page.goto(`${BASE}${target.home}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/live-${target.label}-home.png` });

  await context.close();
  await service.auth.admin.signOut(verified.session.access_token, 'local').catch(() => {});
}

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
