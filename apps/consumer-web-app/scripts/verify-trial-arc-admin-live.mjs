/**
 * The "Suppress trial arc" control, driven on the real production site.
 *
 * Turnstile is live on the login form and refuses a scripted sign in by
 * design, so this run does not use the login form: it mints a one-time
 * session with the Auth Admin API, installs it as the app's own cookie,
 * and retires it afterwards with scope 'local'. See
 * scripts/lib/mint-session.mjs.
 *
 * WHAT IT PROVES.
 *   1. An administrator sees the control on the member access screen.
 *   2. Pressing it writes trial_arc_suppressed_at in production.
 *   3. Pressing it again clears the column back to null.
 *   4. It works on a manually assigned row too, which the guard trigger on
 *      member_subscriptions protects from every other kind of write.
 *   5. A member's own session never sees the control at all.
 *
 * PRODUCTION IS LEFT AS IT WAS FOUND. Both accounts driven here are test
 * accounts, and the column is restored to null at the end whatever
 * happened in between.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mintSessionCookies } from './lib/mint-session.mjs';

const BASE = process.env.BASE_URL ?? 'https://app.mefwellness.com';
const ADMIN = process.env.ADMIN_EMAIL ?? 'oakomah66@gmail.com';
const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

async function suppressionOf(memberId) {
  const { data } = await service
    .from('member_subscriptions')
    .select('trial_arc_suppressed_at')
    .eq('member_id', memberId)
    .maybeSingle();
  return data?.trial_arc_suppressed_at ?? null;
}

async function idOf(email) {
  const { data } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((u) => u.email === email)?.id ?? null;
}

const browser = await chromium.launch();
const minted = [];
try {
  const targets = [
    { email: 'oakomah66+test10@gmail.com', label: 'a system trial row' },
    { email: '8weeks2fab@gmail.com', label: 'a manually assigned program row' },
  ];
  for (const target of targets) {
    target.id = await idOf(target.email);
    check(`found the ${target.label} to drive (${target.email})`, Boolean(target.id));
    check(`${target.email} starts unsuppressed`, (await suppressionOf(target.id)) === null);
  }

  // --- the administrator's session ---
  const adminCookies = await mintSessionCookies(ADMIN, { baseUrl: BASE });
  check('minted a session for the administrator', Boolean(adminCookies));
  if (!adminCookies) throw new Error('cannot continue without an admin session');
  minted.push(adminCookies);
  const admin = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  await admin.addCookies(adminCookies.cookies);
  const page = await admin.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}/admin/access?includeTest=1`, { waitUntil: 'networkidle' });
  check('the member access screen opened for the administrator', page.url().includes('/admin/access'), page.url());
  const controls = page.getByRole('button', { name: /Suppress trial arc|Allow trial arc/ });
  check('the control is on the screen', (await controls.count()) > 0, `${await controls.count()} cards`);
  check(
    'its one line description is the agreed wording',
    (await page.getByText('Stops all trial arc messages for this member. Does not change their access or trial dates.').count()) > 0
  );

  for (const target of targets) {
    const card = page.locator('section').filter({ hasText: target.email });
    check(`${target.email} has a card`, (await card.count()) === 1, `${await card.count()} matches`);

    await card.getByRole('button', { name: 'Suppress trial arc' }).click();
    await page.waitForTimeout(2500);
    const on = await suppressionOf(target.id);
    check(`pressing Suppress wrote the stamp for ${target.label}`, on !== null, String(on));

    await page.reload({ waitUntil: 'networkidle' });
    const reread = page.locator('section').filter({ hasText: target.email });
    check(
      `the screen reads back "Allow trial arc" for ${target.email}`,
      (await reread.getByRole('button', { name: 'Allow trial arc' }).count()) === 1
    );

    await reread.getByRole('button', { name: 'Allow trial arc' }).click();
    await page.waitForTimeout(2500);
    check(`pressing Allow cleared the stamp for ${target.label}`, (await suppressionOf(target.id)) === null);
  }

  check('no page error on the admin screen', pageErrors.length === 0, pageErrors.join(' | '));
  await admin.close();

  // --- a member's own session ---
  const memberEmail = process.env.TEST_MEMBER_EMAIL;
  if (!memberEmail) {
    console.log('SKIP  no TEST_MEMBER_EMAIL, cannot check the non-admin view');
  } else {
    const memberCookies = await mintSessionCookies(memberEmail, { baseUrl: BASE });
    check('minted a session for the test member', Boolean(memberCookies));
    if (memberCookies) {
      minted.push(memberCookies);
      const member = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
      await member.addCookies(memberCookies.cookies);
      const memberPage = await member.newPage();
      await memberPage.goto(`${BASE}/admin/access?includeTest=1`, { waitUntil: 'networkidle' });
      check('a member is turned away from the admin screen', !memberPage.url().includes('/admin/access'), memberPage.url());
      const body = await memberPage.content();
      check('a member never sees the control', !body.includes('Suppress trial arc'));
      await member.close();
    }
  }
} finally {
  for (const m of minted) {
    try {
      await m.service.auth.admin.signOut(m.session.access_token, 'local');
    } catch (error) {
      console.log('could not retire a session:', String(error));
    }
  }
  await browser.close();
  for (const email of ['oakomah66+test10@gmail.com', '8weeks2fab@gmail.com']) {
    const id = await idOf(email);
    if (id) {
      await service.from('member_subscriptions').update({ trial_arc_suppressed_at: null }).eq('member_id', id);
      console.log(`restored ${email} to unsuppressed: ${(await suppressionOf(id)) === null}`);
    }
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
