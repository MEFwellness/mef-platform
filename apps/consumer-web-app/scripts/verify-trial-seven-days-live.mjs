/**
 * Live verification for the 2026-08-31 "trial is 7 days" build.
 *
 * Four questions, asked separately, against real production.
 *
 *   1. GRANDFATHERING, ON THE ADMIN SCREEN. Signed in as the real platform
 *      administrator, /admin/access must still show every existing account
 *      its ORIGINAL trial end date. The dates on the page are checked
 *      against a snapshot of the database taken before this run, not
 *      against each other, and the oldest account is checked by name.
 *
 *   2. A BRAND NEW ACCOUNT GETS 7 DAYS. A throwaway account is created
 *      through the same Auth path a real signup takes, so the same
 *      handle_new_user() trigger stamps it. Its window is measured, and the
 *      admin screen is read to confirm the date a human would actually see.
 *
 *   3. THE THROWAWAY IS ENDED, THEN REMOVED. Its access is ended through
 *      the admin panel's own function (admin_expire_member_access), which
 *      is the control Osei would press, and then the account is deleted
 *      outright so nothing lingers.
 *
 *   4. THE MEMBER EXPERIENCE. Signed in as the standing test member, Home,
 *      Today, the check-in and Root must load with no page error and no
 *      console error, and no screen anywhere may still promise 30 days.
 *
 * Sessions are minted one-time (Turnstile blocks a scripted form sign-in by
 * design) and retired with scope 'local'. Bounded: every navigation has a
 * timeout and the browser closes in a finally block.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const ADMIN_EMAIL = 'info@mefwellness.com';
const MEMBER_EMAIL = '8weeks2fab@gmail.com';
const SHOTS = 'scripts/.verify/shots';
const NAV_TIMEOUT = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

mkdirSync(SHOTS, { recursive: true });

const service = createClient(
  process.env.PROD_SUPABASE_URL,
  readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const results = [];
function record(item, pass, detail) {
  results.push({ item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}\n      ${detail}`);
}

/**
 * Every promise this product has already made, read straight from the
 * database before anything in this run touches production. This is the
 * snapshot the admin screen is checked against.
 */
async function snapshotExistingWindows() {
  const { data, error } = await service
    .from('member_subscriptions')
    .select('member_id, tier, trial_started_at, trial_ends_at')
    .order('trial_started_at', { ascending: true });
  if (error) throw new Error(`subscription read failed: ${error.message}`);
  return data.map((row) => ({
    ...row,
    windowDays: Math.round(
      (new Date(row.trial_ends_at).getTime() - new Date(row.trial_started_at).getTime()) / DAY_MS
    ),
  }));
}

/** How the admin panel prints a trial end date, so a page string can be matched to a row. */
function panelDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * One labelled fact out of a member's card. The <dt> labels are uppercased
 * by CSS, and innerText reflects that, so this matches case-insensitively
 * and stops before the "(N days left)" suffix.
 */
function factOnCard(cardText, label) {
  const match = cardText.match(new RegExp(`^${label}\\s*\\n(.+)$`, 'im'));
  return (match?.[1] ?? '').replace(/\(.*$/, '').trim();
}

async function openAs(browser, email, viewport) {
  const minted = await mintSessionContext(browser, email, { baseUrl: BASE, viewport });
  if (!minted) throw new Error(`could not mint a session for ${email}`);
  return minted;
}

async function visit(context, path) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT,
  });
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
  return { page, status: response?.status() ?? 0, consoleErrors, pageErrors, url: page.url() };
}

/** Anything on a member screen that would still be promising a month. */
const THIRTY_DAY_PROMISE =
  /(30[\s-]?day free|free (for )?30 days|30 days free|your 30 days are complete|month of free|free month|30[\s-]?day trial|trial[^.]{0,40}30 days)/i;

const run = async () => {
  const before = await snapshotExistingWindows();
  const oldest = before[0];
  const { data: oldestUser } = await service.auth.admin.getUserById(oldest.member_id);
  console.log(
    `\nProduction before this run: ${before.length} accounts with a trial window. ` +
      `${before.filter((r) => r.windowDays === 30).length} of them are 30 days long. ` +
      `Oldest start ${oldest.trial_started_at.slice(0, 10)} (${oldestUser?.user?.email ?? 'unknown'}), ends ${oldest.trial_ends_at.slice(0, 10)}.\n`
  );

  const browser = await chromium.launch();
  let admin = null;
  let member = null;
  let throwawayId = '';

  try {
    // ---- 1. The trial length the database now stamps -------------------
    const { data: lengthNow, error: lengthError } = await service.rpc('member_trial_length_days');
    record(
      'The database stamps a 7 day trial on a new account',
      !lengthError && lengthNow === 7,
      lengthError
        ? `RPC failed: ${lengthError.message}`
        : `member_trial_length_days() returns ${lengthNow}.`
    );

    // ---- 2. Grandfathering, on the admin screen ------------------------
    // includeTest=1, so nothing is hidden from the spot-check. The panel
    // still never lists a coach or an administrator (migration 159's
    // admin_list_member_access excludes them by design), which is why the
    // oldest account of all is checked against the database below instead.
    admin = await openAs(browser, ADMIN_EMAIL, { width: 1280, height: 1000 });
    const access = await visit(admin.context, '/admin/access?includeTest=1');
    await access.page.screenshot({ path: `${SHOTS}/trial7-admin-access.png`, fullPage: true });

    record(
      'The admin Member access panel loads for the administrator',
      access.status === 200 && access.url.includes('/admin/access'),
      `HTTP ${access.status} at ${access.url}. ${access.consoleErrors.length} console errors, ${access.pageErrors.length} page errors.`
    );

    // Spot-check the three oldest windows, read out of THAT member's own
    // card rather than off the whole page, because several accounts share
    // an end date and a page-wide search would pass on somebody else's row.
    const emails = new Map();
    for (const row of before) {
      const { data: who } = await service.auth.admin.getUserById(row.member_id);
      emails.set(row.member_id, who?.user?.email ?? row.member_id);
    }

    // The very oldest account of all is the administrator's own, which the
    // panel is built never to list. Checked straight from the database, and
    // reported as exactly that rather than as a screen check.
    record(
      `The oldest account of all keeps its original expiry: ${emails.get(oldest.member_id)}`,
      oldest.windowDays === 30,
      `Read from the database (the panel never lists a coach or administrator account, by design): ` +
        `${oldest.trial_started_at.slice(0, 10)} to ${oldest.trial_ends_at.slice(0, 10)}, ${oldest.windowDays} days.`
    );

    const listed = await access.page.locator('section').allInnerTexts();
    const spotChecks = before
      .filter((row) => listed.some((card) => card.includes(emails.get(row.member_id))))
      .slice(0, 3);
    for (const row of spotChecks) {
      const email = emails.get(row.member_id);
      const expected = panelDate(row.trial_ends_at);
      const card = access.page.locator('section', { hasText: email }).last();
      const cardText = (await card.innerText().catch(() => '')) || '';
      const shownEnd = factOnCard(cardText, 'trial ends');
      const shownStart = factOnCard(cardText, 'trial started');
      const shownTier = factOnCard(cardText, 'tier');
      record(
        `Existing account keeps its original expiry: ${email}`,
        shownEnd === expected && row.windowDays === 30,
        `Stored window ${row.windowDays} days, ${row.trial_started_at.slice(0, 10)} to ${row.trial_ends_at.slice(0, 10)}. ` +
          `Her own card reads: Tier "${shownTier}", Trial started "${shownStart}", Trial ends "${shownEnd}". Expected end "${expected}".`
      );
    }

    const stillThirty = before.filter((r) => r.windowDays === 30).length;
    record(
      'No existing account had its trial recalculated',
      stillThirty === before.length,
      `${stillThirty} of ${before.length} existing accounts still hold a 30 day window. None is 7.`
    );

    // ---- 3. A brand new signup gets 7 days -----------------------------
    const throwawayEmail = `trial.check.${randomUUID().slice(0, 8)}@mefwellness-check.test`;
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: throwawayEmail,
      password: `Throwaway-${randomUUID()}`,
      email_confirm: true,
      user_metadata: { display_name: 'Trial Length Check', timezone: 'America/New_York' },
    });
    if (createError || !created?.user) throw new Error(`could not create throwaway: ${createError?.message}`);
    throwawayId = created.user.id;

    const { data: stamped, error: stampError } = await service
      .from('member_subscriptions')
      .select('tier, source, status, trial_started_at, trial_ends_at')
      .eq('member_id', throwawayId)
      .maybeSingle();

    const stampedDays = stamped
      ? (new Date(stamped.trial_ends_at).getTime() - new Date(stamped.trial_started_at).getTime()) /
        DAY_MS
      : null;
    const startedNow = stamped
      ? Math.abs(Date.now() - new Date(stamped.trial_started_at).getTime()) < 5 * 60 * 1000
      : false;

    record(
      'A brand new signup is given exactly 7 days, starting now',
      !stampError && stampedDays === 7 && startedNow,
      stamped
        ? `Stamped ${stamped.tier}/${stamped.source}/${stamped.status}, ${stamped.trial_started_at} to ${stamped.trial_ends_at} (${stampedDays} days).`
        : `No subscription row was stamped: ${stampError?.message ?? 'row missing'}.`
    );

    const newRow = await visit(admin.context, '/admin/access?includeTest=1');
    const expectedNew = stamped ? panelDate(stamped.trial_ends_at) : '';
    const sevenDaysOut = panelDate(new Date(Date.now() + 7 * DAY_MS).toISOString());
    const newCard = newRow.page.locator('section', { hasText: throwawayEmail }).last();
    const newCardText = (await newCard.innerText().catch(() => '')) || '';
    const shownNewEnd = factOnCard(newCardText, 'trial ends');
    record(
      'The admin panel shows the new account ending 7 days from now',
      Boolean(stamped) && shownNewEnd === expectedNew && expectedNew === sevenDaysOut,
      `The new account's own card reads Trial ends "${shownNewEnd}". ` +
        `Its stored end is "${expectedNew}", and seven days from now is "${sevenDaysOut}".`
    );
    await newRow.page.screenshot({ path: `${SHOTS}/trial7-new-account.png`, fullPage: true });

    // ---- 4. End that account's access, by pressing the real button -----
    // admin_expire_member_access asserts a signed in platform administrator,
    // so the service role cannot call it and this has to go through the
    // panel, which is the point: this is the control Osei would press.
    const endButton = newCard.getByRole('button', { name: 'End access now' });
    let clickDetail = '';
    try {
      await endButton.click({ timeout: 15_000 });
      await newRow.page.waitForTimeout(4_000);
      clickDetail = 'Pressed "End access now" on that account\'s card.';
    } catch (clickError) {
      clickDetail = `Could not press the button: ${String(clickError).slice(0, 140)}`;
    }
    const { data: afterExpire } = await service
      .from('member_subscriptions')
      .select('tier, status, source')
      .eq('member_id', throwawayId)
      .maybeSingle();
    record(
      'The throwaway account is ended from the admin panel, then removed entirely',
      afterExpire?.tier === 'none',
      `${clickDetail} The row now reads tier "${afterExpire?.tier}", status "${afterExpire?.status}", granted by "${afterExpire?.source}". ` +
        'The account is deleted next, so nothing lingers.'
    );

    // ---- 5. The member experience, and the copy sweep ------------------
    member = await openAs(browser, MEMBER_EMAIL, { width: 390, height: 844 });
    const memberScreens = [
      ['/dashboard', 'Home'],
      ['/today', 'Today'],
      ['/checkin', 'Check-in'],
      ['/root-map', 'Root Map'],
      ['/root-score', 'Root Score'],
      ['/profile', 'Profile'],
    ];
    for (const [path, label] of memberScreens) {
      const seen = await visit(member.context, path);
      const text = await seen.page.innerText('body').catch(() => '');
      const promise = text.match(THIRTY_DAY_PROMISE);
      const clean =
        seen.status < 400 && seen.pageErrors.length === 0 && seen.consoleErrors.length === 0;
      record(
        `${label} loads clean and promises no 30 days`,
        clean && !promise,
        `HTTP ${seen.status} at ${seen.url}. ${seen.consoleErrors.length} console errors, ${seen.pageErrors.length} page errors.` +
          (promise ? ` STILL SAYS: "${promise[0]}".` : ' No 30 day promise in the page text.') +
          (seen.consoleErrors.length ? ` First console error: ${seen.consoleErrors[0]}` : '') +
          (seen.pageErrors.length ? ` First page error: ${seen.pageErrors[0]}` : '')
      );
      await seen.page.screenshot({ path: `${SHOTS}/trial7-${label.toLowerCase().replace(/\W+/g, '-')}.png` });
      await seen.page.close();
    }

    // The lock screen itself, which an allowed member is turned away from.
    const lock = await visit(member.context, '/trial-ended');
    record(
      'The lock screen still turns an allowed member away rather than locking them',
      !lock.url.includes('/trial-ended'),
      `Asked for /trial-ended and landed on ${lock.url}, which is the redirect an account with access is meant to get.`
    );
    await lock.page.close();
  } finally {
    if (throwawayId) {
      await service.auth.admin.deleteUser(throwawayId).catch(() => {});
      const { data: gone } = await service.auth.admin.getUserById(throwawayId);
      console.log(`\nThrowaway account removed: ${gone?.user ? 'STILL PRESENT' : 'gone'}.`);
    }
    await retireSession(admin);
    await retireSession(member);
    await browser.close();
  }

  const after = await snapshotExistingWindows();
  const changed = after.filter((row) => {
    const was = before.find((b) => b.member_id === row.member_id);
    return was && was.trial_ends_at !== row.trial_ends_at;
  });
  record(
    'Nothing this run did moved anybody else’s expiry date',
    changed.length === 0,
    `${after.length} accounts read back afterwards, ${changed.length} with a changed trial end date.`
  );

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - ${f.item}: ${f.detail}`);
  }
  process.exitCode = failed.length ? 1 : 0;
};

run().catch((error) => {
  console.error('Run failed:', error);
  process.exitCode = 1;
});
