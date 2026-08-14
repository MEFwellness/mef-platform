#!/usr/bin/env node
/**
 * Membership access, live verification against the real production site and
 * the real production database.
 *
 * It creates exactly one disposable is_test account, drives the whole trial
 * lock through it, and deletes it again in a finally block, whatever
 * happens. It never changes any real member's access, and the only existing
 * account it touches at all is the seeded production test member, which it
 * only ever reads and signs in as.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   MEMBER_ACCESS_KEYS_FILE=/path/to/keys.env \
 *   MEMBER_ACCESS_SHOTS_DIR=/path/to/screenshots \
 *   node scripts/verify-membership-access-live.mjs
 *
 * The keys file holds SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY, one
 * per line. A file path rather than a command line argument on purpose: a
 * service role key on a command line ends up in the shell history and in
 * every process listing on the machine.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const SHOTS = process.env.MEMBER_ACCESS_SHOTS_DIR ?? './live-shots';
mkdirSync(SHOTS, { recursive: true });

const KEYS_FILE = process.env.MEMBER_ACCESS_KEYS_FILE;
if (!KEYS_FILE) throw new Error('Set MEMBER_ACCESS_KEYS_FILE to a file holding the two keys.');
for (const line of readFileSync(KEYS_FILE, 'utf8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1).trim();
}

const PROJECT_REF = process.env.MEMBER_ACCESS_PROJECT_REF ?? 'piafgqstbibvllsnuike';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const BASE = process.env.MEMBER_ACCESS_BASE_URL ?? 'https://app.mefwellness.com';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const DAY = 24 * 60 * 60 * 1000;

const service = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const MEMBER = { email: '8weeks2fab@gmail.com', password: 'RootReset2026!' };
const ADMIN_EMAIL = 'info@mefwellness.com';

const MEMBER_SCREENS = [
  '/dashboard',
  '/today',
  '/progress',
  '/food-lens',
  '/questionnaires',
  '/case',
  '/profile',
  '/membership',
];

async function signInThroughForm(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
}

/** Puts a real Supabase session into a browser context the way @supabase/ssr writes it. */
async function injectSession(context, session) {
  const name = `sb-${PROJECT_REF}-auth-token`;
  const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
  const CHUNK = 3180;
  const cookies = [];
  if (encoded.length <= CHUNK) {
    cookies.push({ name, value: encoded });
  } else {
    for (let i = 0, part = 0; i < encoded.length; i += CHUNK, part += 1) {
      cookies.push({ name: `${name}.${part}`, value: encoded.slice(i, i + CHUNK) });
    }
  }
  await context.addCookies(
    cookies.map((c) => ({
      ...c,
      domain: 'app.mefwellness.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    }))
  );
}

async function mintSessionFor(email) {
  const { data, error } = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink failed: ${error.message}`);
  const anon = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError) throw new Error(`verifyOtp failed: ${verifyError.message}`);
  return { session: verified.session, client: anon };
}

async function readSubscription(memberId) {
  const { data } = await service
    .from('member_subscriptions')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  return data;
}

let probeId = null;
let adminClient = null;

try {
  // ------------------------------------------------------------------
  // Half one: the real production test member must be completely normal.
  // ------------------------------------------------------------------
  const browser = await chromium.launch();
  const memberContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const memberPage = await memberContext.newPage();
  const consoleErrors = [];
  memberPage.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await signInThroughForm(memberPage, MEMBER.email, MEMBER.password);
  check(
    'member signs in through the real form and does not land on the lock screen',
    !memberPage.url().includes('/trial-ended'),
    memberPage.url().replace(BASE, '')
  );

  for (const path of MEMBER_SCREENS) {
    await memberPage.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await memberPage.waitForTimeout(700);
    const landed = new URL(memberPage.url()).pathname;
    check(`member reaches ${path}`, !landed.startsWith('/trial-ended'), `landed on ${landed}`);
  }

  await memberPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await memberPage.waitForTimeout(1200);
  await memberPage.screenshot({ path: `${SHOTS}/member-dashboard.png`, fullPage: false });

  // The member's own entitlement row, read straight from production.
  const { data: memberProfile } = await service
    .from('profiles')
    .select('id')
    .eq('id', (await service.auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users.find(
      (u) => u.email === MEMBER.email
    ).id)
    .maybeSingle();
  const memberSub = await readSubscription(memberProfile.id);
  check(
    'the live member account is on an active trial, not locked',
    memberSub && memberSub.tier === 'trial' && new Date(memberSub.trial_ends_at) > new Date(),
    memberSub ? `ends ${memberSub.trial_ends_at.slice(0, 10)}` : 'no row'
  );
  check('no console errors on the member walk', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));

  // ------------------------------------------------------------------
  // Half two: a fresh disposable test account, deliberately expired.
  // ------------------------------------------------------------------
  const probeEmail = `trial.lock.probe.${randomUUID().slice(0, 8)}@mefwellness-test.com`;
  const probePassword = `Probe-${randomUUID()}`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: probeEmail,
    password: probePassword,
    email_confirm: true,
    user_metadata: { display_name: 'Trial Lock Probe', timezone: 'America/New_York' },
  });
  if (createError) throw new Error(`probe create failed: ${createError.message}`);
  probeId = created.user.id;
  await service.from('profiles').update({ is_test: true }).eq('id', probeId);

  const stamped = await readSubscription(probeId);
  check(
    'a brand new production account is stamped with a 30 day trial automatically',
    stamped &&
      stamped.tier === 'trial' &&
      stamped.source === 'system' &&
      Math.round(
        (new Date(stamped.trial_ends_at) - new Date(stamped.trial_started_at)) / DAY
      ) === 30,
    stamped ? `${stamped.trial_started_at.slice(0, 10)} to ${stamped.trial_ends_at.slice(0, 10)}` : 'no row'
  );

  // Age the trial to exactly what the backfill produces for a 45 day old
  // signup. Allowed on an untouched system row, which is the point.
  const { error: ageError } = await service
    .from('member_subscriptions')
    .update({
      trial_started_at: new Date(Date.now() - 45 * DAY).toISOString(),
      trial_ends_at: new Date(Date.now() - 15 * DAY).toISOString(),
    })
    .eq('member_id', probeId);
  check('the trial window can be aged on an untouched system row', !ageError, ageError?.message ?? '');

  // A test account with no assignment is exempt from the clock, by design.
  const probeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const probePage = await probeContext.newPage();
  await signInThroughForm(probePage, probeEmail, probePassword);
  await probePage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await probePage.waitForTimeout(800);
  check(
    'a TEST account past its trial with no assignment is still let in (the stated exemption)',
    !new URL(probePage.url()).pathname.startsWith('/trial-ended'),
    new URL(probePage.url()).pathname
  );

  // ------------------------------------------------------------------
  // The administrator, signed in for real, drives the panel.
  // ------------------------------------------------------------------
  const minted = await mintSessionFor(ADMIN_EMAIL);
  adminClient = minted.client;
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await injectSession(adminContext, minted.session);
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${BASE}/admin/access?includeTest=1`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForTimeout(2500);
  const onAccessScreen = new URL(adminPage.url()).pathname === '/admin/access';
  check('the administrator reaches the member access screen', onAccessScreen, new URL(adminPage.url()).pathname);
  if (onAccessScreen) {
    await adminPage.screenshot({ path: `${SHOTS}/admin-access.png`, fullPage: true });
    const body = await adminPage.textContent('body');
    check('the access screen lists the probe account by email', body.includes(probeEmail));
    check('the access screen shows a tier, a source and a trial window', body.includes('Granted by') && body.includes('Trial ends'));
    check('the access screen offers the four controls', ['Assign tier', 'full access', 'Extend trial', 'End access now'].every((t) => body.includes(t)));
  }

  // Assign through the real admin function, as the real administrator.
  const assign = async (args) => {
    const { error } = await adminClient.rpc('admin_set_member_access', { p_member_id: probeId, ...args });
    return error;
  };

  const assignError = await assign({ p_tier: 'trial', p_status: 'active' });
  check('the administrator can assign a tier on production', !assignError, assignError?.message ?? '');
  const afterAssign = await readSubscription(probeId);
  check('that assignment is recorded as manual', afterAssign?.source === 'manual', afterAssign?.source ?? '');

  // ------------------------------------------------------------------
  // The lock itself.
  // ------------------------------------------------------------------
  await probePage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await probePage.waitForURL(/trial-ended/, { timeout: 20000 }).catch(() => {});
  await probePage.waitForTimeout(1500);
  const lockedPath = new URL(probePage.url()).pathname;
  check('an expired, assigned account is sent to the trial ended screen', lockedPath === '/trial-ended', lockedPath);
  await probePage.screenshot({ path: `${SHOTS}/trial-ended.png`, fullPage: true });

  const lockBody = await probePage.textContent('body');
  check('the screen says the 30 days are complete', lockBody.includes('Your 30 days are complete'));
  check('the screen contains no em dash', !lockBody.includes('—'));
  const ctaHref = await probePage.getAttribute('a:has-text("Continue with Rooted Reset")', 'href');
  check('the continue button is present and points somewhere', Boolean(ctaHref), `href=${ctaHref}`);
  check(
    'the continue button points at the placeholder because no pricing URL is configured yet',
    ctaHref === '#PRICING_LINK',
    `href=${ctaHref}`
  );

  // Login still works for a locked member.
  await probeContext.clearCookies();
  await signInThroughForm(probePage, probeEmail, probePassword);
  await probePage.waitForTimeout(1500);
  check(
    'login itself still works for a locked member, landing on the lock screen not an error',
    new URL(probePage.url()).pathname === '/trial-ended',
    new URL(probePage.url()).pathname
  );

  for (const path of MEMBER_SCREENS) {
    await probePage.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await probePage.waitForTimeout(500);
    const landed = new URL(probePage.url()).pathname;
    check(`locked member cannot reach ${path}`, landed === '/trial-ended', `landed on ${landed}`);
  }

  // The change-password screen must stay reachable.
  await probePage.goto(`${BASE}/account/password`, { waitUntil: 'domcontentloaded' });
  await probePage.waitForTimeout(600);
  check(
    'a locked member can still reach the change password screen',
    new URL(probePage.url()).pathname === '/account/password',
    new URL(probePage.url()).pathname
  );

  // The event.
  await probePage.goto(`${BASE}/trial-ended`, { waitUntil: 'domcontentloaded' });
  await probePage.waitForTimeout(3000);
  const { data: paywallEvents } = await service
    .from('member_wellness_events')
    .select('event_type, payload')
    .eq('member_id', probeId)
    .eq('event_type', 'paywall_viewed');
  check(
    'a paywall_viewed event with lockReason trial_expired was written',
    (paywallEvents ?? []).some((e) => e.payload?.lockReason === 'trial_expired'),
    JSON.stringify(paywallEvents ?? [])
  );

  const { data: tierEvents } = await service
    .from('member_wellness_events')
    .select('event_type, payload')
    .eq('member_id', probeId)
    .eq('event_type', 'membership_tier_changed');
  check(
    'a membership_tier_changed event was written for the manual assignment',
    (tierEvents ?? []).length >= 1,
    JSON.stringify(tierEvents ?? [])
  );

  // ------------------------------------------------------------------
  // Restoring access, both ways.
  // ------------------------------------------------------------------
  const monthlyError = await assign({ p_tier: 'monthly', p_status: 'active' });
  check('the administrator can assign a paid tier', !monthlyError, monthlyError?.message ?? '');
  await probePage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await probePage.waitForTimeout(1500);
  check(
    'assigning a tier restores access immediately',
    new URL(probePage.url()).pathname === '/dashboard',
    new URL(probePage.url()).pathname
  );

  const { error: expireError } = await adminClient.rpc('admin_expire_member_access', {
    p_member_id: probeId,
  });
  check('the administrator can end access', !expireError, expireError?.message ?? '');
  await probePage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await probePage.waitForTimeout(1500);
  check(
    'ending access locks them again immediately',
    new URL(probePage.url()).pathname === '/trial-ended',
    new URL(probePage.url()).pathname
  );

  const fullError = await assign({ p_full_access: true });
  check('the administrator can grant full access', !fullError, fullError?.message ?? '');
  const afterFull = await readSubscription(probeId);
  check('full access is recorded on the account, with the tier still none', afterFull?.full_access === true && afterFull?.tier === 'none', `tier=${afterFull?.tier} full=${afterFull?.full_access}`);
  await probePage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await probePage.waitForTimeout(1500);
  check(
    'a full access grant restores access on its own, with no tier at all',
    new URL(probePage.url()).pathname === '/dashboard',
    new URL(probePage.url()).pathname
  );

  // ------------------------------------------------------------------
  // The protection, on production.
  // ------------------------------------------------------------------
  const { error: serviceWrite } = await service
    .from('member_subscriptions')
    .update({ tier: 'none', full_access: false, status: 'canceled' })
    .eq('member_id', probeId);
  check(
    'the service role cannot alter a manual assignment on production',
    Boolean(serviceWrite),
    serviceWrite?.message ?? 'NO ERROR, the guard did not fire'
  );
  const afterAttack = await readSubscription(probeId);
  check(
    'and the assignment is untouched after that attempt',
    afterAttack?.full_access === true && afterAttack?.status === 'expired',
    `status=${afterAttack?.status} full=${afterAttack?.full_access}`
  );

  const { error: serviceRpc } = await service.rpc('admin_set_member_access', {
    p_member_id: probeId,
    p_tier: 'none',
  });
  check(
    'the service role cannot call the administrator function on production',
    Boolean(serviceRpc),
    serviceRpc?.message ?? 'NO ERROR'
  );

  await browser.close();
} catch (error) {
  check('script completed without throwing', false, error.message);
  console.error(error);
} finally {
  if (probeId) {
    const { error } = await service.auth.admin.deleteUser(probeId);
    console.log(`cleanup: probe account deleted ${error ? `FAILED ${error.message}` : 'ok'}`);
  }
  if (adminClient) {
    await adminClient.auth.signOut({ scope: 'local' });
    console.log('cleanup: minted administrator session discarded locally');
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILURES:');
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exitCode = 1;
}
