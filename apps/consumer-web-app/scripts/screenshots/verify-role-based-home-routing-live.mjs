#!/usr/bin/env node
/**
 * Live verification for role-based home routing, against production.
 *
 * Two halves, because the change has two halves to prove:
 *
 *   MEMBER, unchanged. Signs in through the real login form as the
 *   standing test member and walks the real member journey: Home, Daily
 *   Reset, Today, Progress, Food Lens and the rest. Every one must render
 *   the member screen it always did, with its engagement content intact.
 *   This is the half that would catch an over-broad route list.
 *
 *   STAFF, redirected. Installs a real session for a production account
 *   that actually holds the coach or platform_administrator role, then
 *   asks for the same member routes. Every one must land on the coach or
 *   admin dashboard instead. It also counts that account's own analytics
 *   rows before and after, so "no member engagement events fire for staff"
 *   is measured rather than assumed.
 *
 * NOTHING SECRET IS EVER PASSED ON A COMMAND LINE OR PRINTED. Both the
 * member password and the service-role key are read from files whose paths
 * are given in env vars, so neither lands in shell history or a process
 * listing. The staff session is minted from a one-time magic-link token
 * through the Auth Admin API, which is exactly the token an email would
 * carry: no password is read, changed or needed for the staff account.
 *
 * Usage, from apps/consumer-web-app:
 *   MEMBER_EMAIL=... MEMBER_PW_FILE=/secure/pw.txt \
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=/secure/key.txt \
 *     node scripts/screenshots/verify-role-based-home-routing-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker.js');
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url.js');

const BASE = 'https://app.mefwellness.com';

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

/** The member routes this change is about, in the order a member meets them. */
const MEMBER_ROUTES = [
  ['/dashboard', 'Home'],
  ['/checkin', 'Daily Reset'],
  ['/today', 'Today'],
  ['/progress', 'Progress'],
  ['/food-lens', 'Food Lens'],
  ['/case', 'Your Case'],
  ['/questionnaires', 'Questionnaires'],
  ['/profile', 'Profile'],
];

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function countAnalyticsRows(userId) {
  const { count, error } = await service
    .from('member_wellness_events')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', userId);
  if (error) throw new Error(`event count failed: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------- member

const browser = await chromium.launch();
const consoleErrors = [];

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${label} ${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label} ${page.url()} :: ${e.message}`));
}

{
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  watch(page, '[member]');

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);

  const landed = page.url().replace(BASE, '');
  check('member signs in', !landed.startsWith('/login'), landed);
  check(
    'member is NOT sent to a staff dashboard',
    !landed.startsWith('/coach') && !landed.startsWith('/admin'),
    landed
  );

  for (const [route, label] of MEMBER_ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const url = page.url().replace(BASE, '');
    check(
      `member reaches ${label} (${route})`,
      url.startsWith(route),
      url
    );
  }

  // The Priority Card and the rest of Home's engagement content, by the
  // text a member actually sees rather than by a CSS class that could
  // change for cosmetic reasons.
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const homeText = await page.locator('body').innerText();
  check('member Home renders a bottom nav with Food Lens', homeText.includes('Food Lens'), '');
  check('member Home renders the Check-In button', homeText.includes('Check-In'), '');
  check('member Home renders Progress and Today tabs', homeText.includes('Progress') && homeText.includes('Today'), '');
  check(
    'member Home shows engagement content, not an empty shell',
    homeText.replace(/\s+/g, ' ').trim().length > 400,
    `${homeText.replace(/\s+/g, ' ').trim().length} chars`
  );

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

const staffTargets = [];
const anyCoach = [...byUser.entries()].find(([, r]) => r.isCoach);
const adminOnly = [...byUser.entries()].find(([, r]) => r.isAdmin && !r.isCoach);
if (anyCoach) staffTargets.push({ userId: anyCoach[0], roles: anyCoach[1], expected: '/coach' });
if (adminOnly) staffTargets.push({ userId: adminOnly[0], roles: adminOnly[1], expected: '/admin' });

check('found at least one staff account on production to test with', staffTargets.length > 0, `${staffTargets.length}`);

for (const target of staffTargets) {
  const { data: userRow } = await service.auth.admin.getUserById(target.userId);
  const email = userRow?.user?.email;
  if (!email) {
    check(`staff account ${target.userId.slice(0, 8)} has an email`, false);
    continue;
  }
  const label = target.expected === '/coach' ? 'coach' : 'administrator';

  const before = await countAnalyticsRows(target.userId);

  // A one-time magic-link token, the same thing the email would carry.
  // Redeemed here rather than clicked, so no mail is sent and no password
  // is read or changed.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    check(`${label}: mint a session`, false, linkError?.message ?? 'no token');
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
    check(`${label}: mint a session`, false, verifyError?.message ?? 'no session');
    continue;
  }
  check(`${label}: mint a session`, true, `${label} account`);

  // Written exactly the way @supabase/ssr writes it, so the app's own
  // middleware reads it as an ordinary signed-in session.
  const encoded = `base64-${stringToBase64URL(JSON.stringify(verified.session))}`;
  const chunks = createChunks(COOKIE_NAME, encoded);

  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
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
  watch(page, `[${label}]`);

  // Their own dashboard opens.
  await page.goto(`${BASE}${target.expected}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  check(
    `${label}: own dashboard ${target.expected} opens`,
    page.url().replace(BASE, '').startsWith(target.expected),
    page.url().replace(BASE, '')
  );

  // Every member route redirects there instead of rendering.
  for (const [route, routeLabel] of [...MEMBER_ROUTES, ['/onboarding', 'Onboarding'], ['/reset-plan', 'Reset Plan']]) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const url = page.url().replace(BASE, '');
    check(
      `${label}: ${routeLabel} (${route}) redirects to ${target.expected}`,
      url.startsWith(target.expected),
      url
    );
  }

  // The bare routing hub, the deep-link case: signing in or reopening the
  // app must never resolve to the member Home for a staff account.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  check(
    `${label}: the app root resolves to ${target.expected}`,
    page.url().replace(BASE, '').startsWith(target.expected),
    page.url().replace(BASE, '')
  );

  await context.close();

  // Nothing this account did during the whole walk may have been recorded
  // as member behavior.
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const after = await countAnalyticsRows(target.userId);
  check(
    `${label}: recorded zero new member analytics events`,
    after === before,
    `${before} -> ${after}`
  );

  // The session was minted only for this check; retire it so nothing is
  // left behind on the account.
  await service.auth.admin.signOut(verified.session.access_token, 'local').catch(() => {});
}

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`console errors: ${consoleErrors.length}`);
for (const error of consoleErrors.slice(0, 15)) console.log(`  ${error}`);
process.exit(failed.length === 0 ? 0 : 1);
