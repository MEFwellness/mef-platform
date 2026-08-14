#!/usr/bin/env node
/**
 * Provisions a dedicated ADMIN-ONLY account.
 *
 * Why this script exists at all. `handle_new_user()` (migration 17, last
 * re-created by migration 146) hardcodes a `member` role grant on EVERY
 * account, created by any path — signup form, admin invite, a future social
 * login. That is correct for the product and is deliberately left alone
 * here. It does mean "admin only" cannot be achieved by simply not granting
 * `member`: the grant already exists by the time any caller sees the new
 * user id.
 *
 * So this script does not fight the trigger, and it does not delete rows to
 * hide what happened. It uses the revocation mechanism `user_roles` has had
 * since migration 4: the baseline grant is marked `revoked_at` / `revoked_by`,
 * and `platform_administrator` is granted. `has_active_role()` — the one
 * function both the app guards and the RLS policies call — then answers
 * false for `member` and true for `platform_administrator`, so every layer
 * agrees, and the audit trail still records truthfully that the trigger
 * granted a baseline role and that provisioning revoked it.
 *
 * The account is consequently invisible to analytics for free:
 * `analytics_member_scope()` (migration 149) excludes any profile holding an
 * active staff role grant, so it is not counted, not listed, and not in any
 * denominator on any admin analytics screen — with the test-account toggle
 * on or off. It is assigned to no coach, so it appears in no caseload.
 *
 * Credentials come from the environment and are never hardcoded and never
 * fall back to a local value, the same discipline
 * scripts/seed-production-test-accounts.mjs already uses:
 *   ADMIN_SUPABASE_URL              — the target Supabase project's API URL
 *   ADMIN_SUPABASE_SERVICE_ROLE_KEY — its service-role key
 *   ADMIN_ACCOUNT_EMAIL             — the address to provision
 *   ADMIN_ACCOUNT_PASSWORD          — its temporary password
 *   ADMIN_ACCOUNT_DISPLAY_NAME      — optional, defaults to "MEF Wellness Admin"
 *
 * Usage, from apps/consumer-web-app:
 *   node scripts/provision-admin-account.mjs
 *
 * Idempotent. An existing account with that address is reused, not
 * recreated; its password is reset to ADMIN_ACCOUNT_PASSWORD and its roles
 * are re-converged to admin-only. Re-running it is always safe.
 *
 * Prints no secret. The password is never echoed, and the service-role key
 * is never logged.
 */
import { createClient } from '@supabase/supabase-js';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. This script refuses to guess or fall back to a ` +
        "local/dev value when provisioning an administrator — see this file's own header comment."
    );
  }
  return value;
}

const SUPABASE_URL = requiredEnv('ADMIN_SUPABASE_URL');
const SERVICE_ROLE_KEY = requiredEnv('ADMIN_SUPABASE_SERVICE_ROLE_KEY');
const EMAIL = requiredEnv('ADMIN_ACCOUNT_EMAIL').toLowerCase();
const PASSWORD = requiredEnv('ADMIN_ACCOUNT_PASSWORD');
const DISPLAY_NAME = process.env.ADMIN_ACCOUNT_DISPLAY_NAME || 'MEF Wellness Admin';

/** Every role this account must NOT hold. Anything active here is revoked. */
const NON_ADMIN_ROLES = ['member', 'coach', 'clinician_reviewer'];
const ADMIN_ROLE = 'platform_administrator';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * listUsers is paged; an address that exists past page one still has to be
 * found, or the script would create a duplicate and break its own idempotency
 * claim.
 */
async function findUserByEmail(email) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser() {
  const existing = await findUserByEmail(EMAIL);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, display_name: DISPLAY_NAME },
    });
    if (error) throw new Error(`updateUserById failed: ${error.message}`);
    console.log(`reused existing account ${existing.id} (password reset, email confirmed)`);
    return existing.id;
  }

  // email_confirm: true — this is a staff account provisioned deliberately,
  // not a self-serve signup, so there is no verification mail to click.
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: DISPLAY_NAME },
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  console.log(`created account ${data.user.id}`);
  return data.user.id;
}

async function convergeRoles(userId) {
  // The trigger has already granted `member` by now. Revoke it, and anything
  // else non-admin that happens to be active, through the audit columns.
  for (const role of NON_ADMIN_ROLES) {
    const { data, error } = await admin
      .from('user_roles')
      .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
      .eq('user_id', userId)
      .eq('role', role)
      .is('revoked_at', null)
      .select('id');
    if (error) throw new Error(`revoking ${role} failed: ${error.message}`);
    if ((data ?? []).length > 0) console.log(`revoked ${data.length} active ${role} grant(s)`);
  }

  const { data: activeAdmin, error: readError } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role', ADMIN_ROLE)
    .is('revoked_at', null);
  if (readError) throw new Error(`reading admin grant failed: ${readError.message}`);

  if ((activeAdmin ?? []).length === 0) {
    const { error } = await admin
      .from('user_roles')
      .insert({ user_id: userId, role: ADMIN_ROLE, granted_by: userId });
    if (error) throw new Error(`granting ${ADMIN_ROLE} failed: ${error.message}`);
    console.log(`granted ${ADMIN_ROLE}`);
  } else {
    console.log(`${ADMIN_ROLE} already active`);
  }
}

/**
 * Proves the outcome with the same function the app guards and the RLS
 * policies use, rather than trusting the writes above. A provisioning script
 * that reports success without checking is how an account ends up holding a
 * role nobody intended.
 */
async function verify(userId) {
  const results = {};
  for (const role of [...NON_ADMIN_ROLES, ADMIN_ROLE]) {
    const { data, error } = await admin.rpc('has_active_role', { p_user: userId, p_role: role });
    if (error) throw new Error(`has_active_role(${role}) failed: ${error.message}`);
    results[role] = data === true;
  }

  const problems = [];
  for (const role of NON_ADMIN_ROLES) {
    if (results[role]) problems.push(`still holds ${role}`);
  }
  if (!results[ADMIN_ROLE]) problems.push(`does not hold ${ADMIN_ROLE}`);

  // Invisible to analytics: not in scope with the test toggle off OR on.
  for (const includeTest of [false, true]) {
    const { data, error } = await admin.rpc('analytics_member_scope', { p_include_test: includeTest });
    if (error) throw new Error(`analytics_member_scope(${includeTest}) failed: ${error.message}`);
    if ((data ?? []).some((row) => row.member_id === userId)) {
      problems.push(`appears in analytics_member_scope(include_test=${includeTest})`);
    }
  }

  // In no coach's caseload.
  const { data: assignments, error: assignmentError } = await admin
    .from('coach_client_assignments')
    .select('id')
    .eq('client_id', userId);
  if (assignmentError) throw new Error(`reading assignments failed: ${assignmentError.message}`);
  if ((assignments ?? []).length > 0) problems.push('is assigned to a coach');

  console.log('roles:', JSON.stringify(results));
  console.log('in analytics member scope: false (both toggles)');
  console.log(`coach assignments: ${(assignments ?? []).length}`);

  if (problems.length > 0) {
    throw new Error(`Account is NOT admin-only: ${problems.join('; ')}`);
  }
  console.log('VERIFIED: admin-only, invisible to analytics, in no caseload.');
}

const userId = await ensureUser();
await convergeRoles(userId);
await verify(userId);
