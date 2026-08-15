#!/usr/bin/env node
/**
 * Live verification, against production, for the sign-out confirmation
 * dialog fix.
 *
 * The defect this proves gone is a geometry defect, so this measures
 * rather than asserts: it reads both buttons' real bounding boxes on a
 * phone-sized viewport and confirms they land inside the visible screen,
 * and it walks the DOM upward from the dialog to confirm nothing above it
 * has a transform, filter or backdrop filter, which is what captured its
 * fixed positioning in the first place.
 *
 * Member half runs through the real login form. Staff half installs a real
 * session for a production coach and a production administrator, minted
 * from a one-time magic-link token through the Auth Admin API, so no staff
 * password is read, needed or changed. Same discipline as
 * scripts/screenshots/verify-staff-chrome-and-signout-live.mjs: nothing
 * secret is passed on a command line or printed.
 *
 * Usage, from apps/consumer-web-app:
 *   MEMBER_EMAIL=... MEMBER_PW_FILE=/secure/pw.txt \
 *   PROD_SUPABASE_URL=... PROD_SERVICE_KEY_FILE=/secure/key.txt \
 *   PROD_ANON_KEY_FILE=/secure/anon.txt \
 *     node scripts/screenshots/verify-signout-dialog-live.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker.js');
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url.js');

const BASE = 'https://app.mefwellness.com';
const OUT = process.env.OUT ?? '/tmp/signout-dialog-live';
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
// iPhone 14, the device in the report.
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

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
    const frame = dialog.closest('.mef-modal-viewport');
    return {
      open: true,
      body: dialog.innerText.replace(/\s+/g, ' ').trim(),
      buttons,
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

async function signInMember(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', MEMBER_EMAIL);
  await page.fill('input[type="password"]', MEMBER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(7000);
  return page.url();
}

// ---------------------------------------------------------------- member
{
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await signInMember(page);

  // Driven from Today, not Home: this account has a Root pop-up sitting on
  // Home, and dismissing it would change the account's own state.
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  check('member is signed in on a real member screen', !page.url().includes('/login'), page.url().replace(BASE, ''));

  await page.click('button[aria-label="Profile menu"]');
  await page.waitForTimeout(1200);
  await page.click('div[aria-label="Profile menu"] button:has-text("Sign Out")');
  await page.waitForTimeout(1200);

  const state = await readDialog(page);
  await page.screenshot({ path: `${OUT}/live-member-dialog.png` });
  check('member: dialog opens', state.open === true);
  check('member: it is a floating overlay, a child of <body>', state.portalledToBody === true);
  check('member: nothing above it captures fixed positioning', state.insideTransformedAncestor === null, String(state.insideTransformedAncestor));
  check('member: dimmed backdrop present', state.backdrop === true);
  check(
    'member: BOTH buttons fully inside the visible viewport',
    buttonsFullyVisible(state),
    JSON.stringify(state.buttons) + ` viewport ${state.viewport.width}x${state.viewport.height}`
  );
  check('member: copy is the member wording', /check-ins, Root Score, and coaching/.test(state.body), state.body);
  check('member: no em dash', !state.body.includes('—'));

  await page.click('div[aria-label="Confirm sign out"] button:has-text("Cancel")');
  await page.waitForTimeout(1200);
  check('member: Cancel closes the dialog', (await readDialog(page)).open === false);
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  check('member: still signed in after Cancel', !page.url().includes('/login'), page.url().replace(BASE, ''));

  await page.click('button[aria-label="Profile menu"]');
  await page.waitForTimeout(1200);
  await page.click('div[aria-label="Profile menu"] button:has-text("Sign Out")');
  await page.waitForTimeout(1200);
  await page.click('div[aria-label="Confirm sign out"] button:has-text("Sign Out")');
  await page.waitForTimeout(8000);
  check('member: confirming lands on the login screen', page.url().includes('/login'), page.url().replace(BASE, ''));
  await page.screenshot({ path: `${OUT}/live-member-after-signout.png` });

  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(5000);
  check('member: back button cannot re-enter', page.url().includes('/login'), page.url().replace(BASE, ''));

  const back = await signInMember(page);
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  check('member: signs back in and the account works', !page.url().includes('/login'), page.url().replace(BASE, ''));

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

const targets = [];
const adminOnly = [...byUser.entries()].find(([, r]) => r.isAdmin && !r.isCoach);
const anyCoach = [...byUser.entries()].find(([, r]) => r.isCoach);
if (adminOnly)
  targets.push({ userId: adminOnly[0], home: '/admin', label: 'admin', expect: /manage the platform/ });
if (anyCoach)
  targets.push({ userId: anyCoach[0], home: '/coach', label: 'coach', expect: /manage your clients/ });

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

  await page.goto(`${BASE}${target.home}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.click('nav[aria-label="Staff"] button');
  await page.waitForTimeout(1200);

  const state = await readDialog(page);
  await page.screenshot({ path: `${OUT}/live-${target.label}-dialog.png` });
  check(`${target.label}: dialog opens`, state.open === true);
  check(`${target.label}: it is a floating overlay, a child of <body>`, state.portalledToBody === true);
  check(`${target.label}: nothing above it captures fixed positioning`, state.insideTransformedAncestor === null, String(state.insideTransformedAncestor));
  check(
    `${target.label}: BOTH buttons fully inside the visible viewport`,
    buttonsFullyVisible(state),
    JSON.stringify(state.buttons) + ` viewport ${state.viewport.width}x${state.viewport.height}`
  );
  check(`${target.label}: copy is the ${target.label} wording`, target.expect.test(state.body), state.body);
  check(`${target.label}: no member language`, !/check-ins, Root Score/.test(state.body), state.body);
  check(`${target.label}: no em dash`, !state.body.includes('—'));

  await page.click('div[aria-label="Confirm sign out"] button:has-text("Cancel")');
  await page.waitForTimeout(1200);
  check(`${target.label}: Cancel closes the dialog`, (await readDialog(page)).open === false);
  await page.goto(`${BASE}${target.home}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  check(`${target.label}: still signed in after Cancel`, !page.url().includes('/login'), page.url().replace(BASE, ''));

  await context.close();
  await service.auth.admin.signOut(verified.session.access_token, 'local').catch(() => {});
}

await browser.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
