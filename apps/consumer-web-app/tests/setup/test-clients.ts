/**
 * Shared setup for the integration test suite.
 *
 * These tests exercise real RLS policies and RPC functions against a local
 * Supabase instance (`supabase start` + `supabase db reset` from repo
 * root) — no mocked Supabase client, per the project's stated testing
 * philosophy (see root README's "Testing" section). Server actions in
 * app/actions/*.ts can't be called directly here: they use
 * `cookies()` from `next/headers`, which throws outside a Next.js request
 * scope ("`cookies` was called outside a request scope"). Instead, these
 * tests authenticate as the real seeded users and issue the same
 * Supabase queries/RPCs the server actions issue, which is what actually
 * proves the behavior the app depends on: the database's own policies and
 * functions, not a thin wrapper around them. Pure helpers with no Supabase
 * client (e.g. resolveLocalDate) are imported and tested directly instead.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll } from 'vitest';

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '../../.env.local');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase env vars for tests. Run `supabase start` from the repo ' +
      'root and copy apps/consumer-web-app/.env.local.example to .env.local ' +
      '(or set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / ' +
      'SUPABASE_SERVICE_ROLE_KEY directly, as CI does).'
  );
}

/** Seeded users from supabase/seed/02_users.sql — fixed UUIDs, shared password. */
export const TEST_USERS = {
  memberOne: {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'member.one@example.test',
    password: 'DevPassword123!',
  },
  memberTwo: {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'member.two@example.test',
    password: 'DevPassword123!',
  },
  coachOne: {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'coach.one@example.test',
    password: 'DevPassword123!',
  },
  adminOne: {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'admin.one@example.test',
    password: 'DevPassword123!',
  },
} as const;

/** Anon client with no session — behaves like a signed-out visitor under RLS. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, ANON_KEY!);
}

/**
 * Service-role client — bypasses RLS entirely. Used ONLY for test fixture
 * setup/teardown (e.g. deleting rows a test inserted), never to exercise
 * the behavior under test — using it there would prove nothing about RLS.
 */
export function serviceRoleClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
}

/** A fresh, authenticated client for one of the seeded test users. */
export async function signInAs(
  user: (typeof TEST_USERS)[keyof typeof TEST_USERS]
): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!);
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) {
    throw new Error(
      `signInAs(${user.email}) failed: ${error.message}. Is local Supabase ` +
        'running with a freshly reset + seeded database (`supabase db reset`)?'
    );
  }
  return client;
}

beforeAll(async () => {
  // Fail fast with a clear message rather than 20s of cryptic per-test
  // timeouts if Supabase isn't running.
  const client = anonClient();
  const { error } = await client.from('roles').select('role').limit(1);
  if (error) {
    throw new Error(
      `Cannot reach local Supabase at ${SUPABASE_URL}: ${error.message}. ` +
        'Run `supabase start` (and `supabase db reset` if the schema changed) from the repo root first.'
    );
  }
});
