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
 * NEVER CREATE A USER ROW WITH SQL. GoTrue writes '' into several auth.users
 * columns that it later scans into plain Go strings. A hand written INSERT
 * that omits them leaves NULL, and one such row makes EVERY listUsers call in
 * the project fail with a 500 and an empty body, as well as making that
 * account unable to sign in. If that has already happened, the fix is
 * scripts/repair-auth-null-tokens.sql at the repo root, which is idempotent
 * and safe to run at any time.
 *
 * Prints no secret. The password is never echoed, and the service-role key
 * is never logged. Credentials are read from the gitignored .env.local files
 * the repo already keeps, so the key never has to be typed on a command line.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Reads the gitignored env files the repo already keeps, so the operator does
 * not have to export anything by hand and, more importantly, does not have to
 * handle the service-role key on a command line where it would land in shell
 * history. Anything already exported wins, so a deliberate override still
 * works.
 */
function loadEnvFiles() {
  const candidates = [
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../../../.env.local'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}
loadEnvFiles();

function requiredEnv(name, hint) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. This script refuses to guess or fall back to a ` +
        `local/dev value when provisioning an administrator.${hint ? ` ${hint}` : ''}`
    );
  }
  return value;
}

const SUPABASE_URL = requiredEnv(
  'ADMIN_SUPABASE_URL',
  'This is the project API URL, for example https://<project-ref>.supabase.co, NOT the database connection string.'
);
const SERVICE_ROLE_KEY = requiredEnv(
  'ADMIN_SUPABASE_SERVICE_ROLE_KEY',
  'Get it with: npx supabase projects api-keys --project-ref <ref>. It must be the service_role key; the anon key cannot create users.'
);
const EMAIL = requiredEnv('ADMIN_ACCOUNT_EMAIL').toLowerCase();
const PASSWORD = requiredEnv('ADMIN_ACCOUNT_PASSWORD');
const DISPLAY_NAME = process.env.ADMIN_ACCOUNT_DISPLAY_NAME || 'MEF Wellness Admin';

/**
 * Fails early and in plain language when the wrong key was supplied, rather
 * than letting it surface later as an opaque authorization error from the
 * API. Only ever inspects the role claim; the key itself is never logged.
 */
function assertServiceRoleKey(key) {
  const segments = key.split('.');
  if (segments.length !== 3) {
    throw new Error(
      'ADMIN_SUPABASE_SERVICE_ROLE_KEY is not a JWT. A truncated paste (the CLI table elides the ' +
        'newer sb_secret_... key with dots) is the usual cause. Re-copy the full service_role value.'
    );
  }
  let role;
  try {
    role = JSON.parse(Buffer.from(segments[1], 'base64').toString()).role;
  } catch {
    throw new Error('ADMIN_SUPABASE_SERVICE_ROLE_KEY could not be decoded. Re-copy it in full.');
  }
  if (role !== 'service_role') {
    throw new Error(
      `ADMIN_SUPABASE_SERVICE_ROLE_KEY carries role "${role}", not "service_role". ` +
        'The anon key cannot create users or read user_roles past RLS.'
    );
  }
}
assertServiceRoleKey(SERVICE_ROLE_KEY);

/** Every role this account must NOT hold. Anything active here is revoked. */
const NON_ADMIN_ROLES = ['member', 'coach', 'clinician_reviewer'];
const ADMIN_ROLE = 'platform_administrator';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Turns an auth error into something an operator can act on.
 *
 * A 500 with an empty body from any user-listing call has one overwhelmingly
 * likely cause, and it is not this script: an auth.users row somewhere in the
 * project has NULL in a column GoTrue scans into a plain Go string. That makes
 * the scan fail for the WHOLE query, so ONE malformed row takes out the admin
 * users API for every caller. It happens when a user row is inserted with SQL
 * instead of through this API, which is exactly why this script exists.
 *
 * This was a real incident on 2026-08-14: info@mefwellness.com was created
 * with a hand written INSERT, and from then until it was repaired, every
 * listUsers call for the entire project returned `{}`. The message below is
 * what would have turned a two hour diagnosis into a two minute one.
 */
function explainAuthError(label, error) {
  const status = error?.status;
  const message = typeof error?.message === 'string' ? error.message : JSON.stringify(error);
  const empty = !message || message === '{}' || message === '{}\n';

  if (status === 500 && empty) {
    return (
      `${label} failed with a 500 and an empty body.\n\n` +
      'This almost always means an auth.users row has NULL where GoTrue expects an empty string, ' +
      'which breaks the query for every row, not just that one. It is a project-wide fault and it ' +
      'is not caused by the arguments you passed.\n\n' +
      'Repair it with the documented, idempotent script, then re-run this one:\n' +
      '  export $(grep -E "^SUPABASE_DB_URL=" .env.local | head -1)\n' +
      '  psql "$SUPABASE_DB_URL" -f scripts/repair-auth-null-tokens.sql\n'
    );
  }
  if (status === 401 || status === 403) {
    return `${label} failed with ${status}: ${message}. The key was accepted as a service_role JWT, so check it belongs to THIS project (${SUPABASE_URL}).`;
  }
  return `${label} failed${status ? ` (${status})` : ''}: ${message}`;
}

/**
 * listUsers is paged; an address that exists past page one still has to be
 * found, or the script would create a duplicate and break its own idempotency
 * claim.
 */
async function findUserByEmail(email) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(explainAuthError('listUsers', error));
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
    if (error) throw new Error(explainAuthError('updateUserById', error));
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
  if (error) throw new Error(explainAuthError('createUser', error));
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
