#!/usr/bin/env node
/**
 * Provisions the throwaway member the Visibility Layer build needs.
 *
 * WHY A THROWAWAY MEMBER EXISTS AT ALL. The whole promise of this build is
 * that a member's own answers decide what her app contains. That promise is
 * only checkable by running intake more than once with deliberately
 * contrasting answers and comparing what appears, which a real member's
 * account can never be used for: her intake submission is a permanent
 * record, and her stored reveals carry sentences she has already been told.
 *
 * It is also the only honest place to exercise engine states that a real
 * member has not reached. The standing production test member has responded
 * to her priority card on every single day it has ever been shown to her,
 * so her ignore counter is zero, and writing a 3 into it would assert three
 * days of ignoring that did not happen, on an account the engine would then
 * act on. There is no real person behind this account for that to be wrong
 * about.
 *
 * WHAT IT SETS.
 *   is_test = true    — which is what the three sanctioned reset routes and
 *                       their matching database policies (migrations 151,
 *                       156 and 167) check before they will delete anything.
 *   email confirmed   — so the account can sign in immediately without a
 *                       mailbox.
 *   timezone          — America/New_York, matching every other test account.
 *
 * WHAT IT DOES NOT DO. It seeds no check-ins, no answers, no findings and no
 * assessments. A genuinely empty day-one account is exactly what a
 * default-hidden test needs, and anything seeded here would be a fact the
 * rules had not derived from her.
 *
 * Requires production credentials as environment variables. Never
 * hardcoded, never falls back to a local value; a missing var throws
 * immediately, the same discipline scripts/seed-production-test-accounts.mjs
 * already uses.
 *   VIS_SUPABASE_URL
 *   VIS_SUPABASE_SERVICE_ROLE_KEY
 *   VIS_MEMBER_EMAIL
 *   VIS_MEMBER_PASSWORD
 *
 * Usage, from apps/consumer-web-app:
 *   node scripts/provision-visibility-test-member.mjs
 *
 * Idempotent. An existing account with the same email is reused, its
 * password reset to the given one, and its flags re-applied.
 */
import { createClient } from '@supabase/supabase-js';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. This script refuses to guess or fall back to a ` +
        "local value when writing to production. See this file's own header."
    );
  }
  return value;
}

const SUPABASE_URL = requiredEnv('VIS_SUPABASE_URL');
const SERVICE_ROLE_KEY = requiredEnv('VIS_SUPABASE_SERVICE_ROLE_KEY');
const EMAIL = requiredEnv('VIS_MEMBER_EMAIL');
const PASSWORD = requiredEnv('VIS_MEMBER_PASSWORD');
const DISPLAY_NAME = process.env.VIS_MEMBER_DISPLAY_NAME || 'Routing Test';
const TIMEZONE = 'America/New_York';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  // listUsers is paged; this project has few enough accounts that two pages
  // is generous, and a miss simply means "create it".
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const existing = await findUserByEmail(EMAIL);

  let userId;
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = existing.id;
    console.log(`Reused existing account ${EMAIL}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: DISPLAY_NAME },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created account ${EMAIL}`);
  }

  // The profile row is created by a trigger on signup; upsert so a reused
  // account has its flags re-applied and a brand-new one is not raced.
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      { id: userId, display_name: DISPLAY_NAME, timezone: TIMEZONE, is_test: true },
      { onConflict: 'id' }
    );
  if (profileError) throw profileError;

  const { data: check } = await admin
    .from('profiles')
    .select('id, display_name, timezone, is_test')
    .eq('id', userId)
    .single();

  console.log(JSON.stringify({ userId, profile: check }, null, 2));
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
