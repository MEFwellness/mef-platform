/**
 * The lock screen itself, on production, for both kinds of member.
 *
 * A member stamped before migration 198 was promised 30 days and a member
 * stamped after it gets 7. Both land on /trial-ended when their window
 * closes, so the screen must say something true to each of them. That is
 * the one member-facing change in this build, and it is the one thing the
 * main verification run cannot see, because no real account is locked out
 * today.
 *
 * NOBODY REAL IS TOUCHED. Two throwaway accounts are created by this script
 * alone, given an already-closed window of their own (one 30 days long, one
 * 7), read, and deleted in a finally block. No existing account is read,
 * written or signed into, and the two windows are snapshotted before and
 * after so the run can prove it moved nobody.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
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

async function othersUnchanged() {
  const { data } = await service
    .from('member_subscriptions')
    .select('member_id, trial_ends_at')
    .order('trial_started_at', { ascending: true });
  return new Map((data ?? []).map((r) => [r.member_id, r.trial_ends_at]));
}

/** A fresh account whose trial window is already closed, and exactly `days` long. */
async function lockedAccountWithWindow(days) {
  const email = `lock.check.${randomUUID().slice(0, 8)}@mefwellness-check.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: `Throwaway-${randomUUID()}`,
    email_confirm: true,
    user_metadata: { display_name: 'Lock Screen Check', timezone: 'America/New_York' },
  });
  if (error || !data?.user) throw new Error(`could not create throwaway: ${error?.message}`);

  // Closed two days ago, so the window really is shut and the start moves
  // with the end (the table's own trial_ends_at >= trial_started_at check).
  const endsAt = new Date(Date.now() - 2 * DAY_MS);
  const startedAt = new Date(endsAt.getTime() - days * DAY_MS);
  const { error: updateError } = await service
    .from('member_subscriptions')
    .update({
      trial_started_at: startedAt.toISOString(),
      trial_ends_at: endsAt.toISOString(),
    })
    .eq('member_id', data.user.id);
  if (updateError) throw new Error(`could not age the window: ${updateError.message}`);

  return { id: data.user.id, email, startedAt, endsAt };
}

const run = async () => {
  const before = await othersUnchanged();
  const browser = await chromium.launch();
  const created = [];
  const minted = [];

  try {
    for (const days of [30, 7]) {
      const account = await lockedAccountWithWindow(days);
      created.push(account.id);

      const session = await mintSessionContext(browser, account.email, {
        baseUrl: BASE,
        viewport: { width: 390, height: 844 },
      });
      if (!session) throw new Error(`could not mint a session for the ${days} day throwaway`);
      minted.push(session);

      const page = await session.context.newPage();
      const consoleErrors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text());
      });
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));

      // Asking for Home, not the lock screen: the redirect is half the claim.
      const response = await page.goto(`${BASE}/dashboard`, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT,
      });
      await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});

      const landed = page.url();
      const heading = (await page.locator('h1').first().innerText().catch(() => '')) || '';
      const body = await page.innerText('body').catch(() => '');
      await page.screenshot({ path: `${SHOTS}/trial-lock-${days}day.png`, fullPage: true });

      record(
        `A member whose ${days} day window has closed is sent to the lock screen`,
        landed.includes('/trial-ended') && (response?.status() ?? 0) < 400,
        `Asked for /dashboard and landed on ${landed}. ${consoleErrors.length} console errors, ${pageErrors.length} page errors.`
      );

      record(
        `The lock screen tells that member she had ${days} days, not the other number`,
        heading === `Your ${days} days are complete`,
        `The heading reads "${heading}". Expected "Your ${days} days are complete".`
      );

      const otherNumber = days === 30 ? '7 days' : '30 days';
      record(
        `Nothing on that screen mentions ${otherNumber}`,
        !body.includes(otherNumber),
        `Searched the whole rendered page for "${otherNumber}": ${body.includes(otherNumber) ? 'FOUND' : 'not present'}.`
      );

      record(
        `The ${days} day lock screen carries no em dash and still offers a way on`,
        !body.includes('—') && body.includes('Continue with Rooted Reset'),
        `Em dash ${body.includes('—') ? 'FOUND' : 'absent'}. ` +
          `"Continue with Rooted Reset" ${body.includes('Continue with Rooted Reset') ? 'present' : 'MISSING'}.`
      );

      await page.close();
    }
  } finally {
    for (const session of minted) await retireSession(session);
    for (const id of created) {
      await service.auth.admin.deleteUser(id).catch(() => {});
    }
    await browser.close();
    console.log(`\nThrowaway accounts removed: ${created.length}.`);
  }

  const after = await othersUnchanged();
  let moved = 0;
  for (const [id, endsAt] of before) {
    if (after.get(id) !== endsAt) moved += 1;
  }
  record(
    'This run moved nobody else’s expiry date',
    moved === 0,
    `${before.size} accounts before, ${after.size} after, ${moved} with a changed trial end date.`
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
