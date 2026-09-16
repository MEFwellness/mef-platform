/**
 * The one place a trusted connection is built for the matching engine.
 *
 * WHY IT NEEDS ONE, AND WHY THAT IS NOT A HOLE IN THE FENCE.
 *
 * Re-evaluation happens at the three moments the brief names, and two of
 * them are moments when NO COACH SESSION EXISTS AT ALL: a member finishing
 * a sitting is a member, under her own session, and the signals from that
 * sitting are written by the ingestion engine through this same trusted
 * connection for exactly the same reason (see
 * lib/cross-system-signals/serviceRole.ts, which states the precedent and
 * the authorization comment behind it).
 *
 * WHAT IT DOES NOT DO. It never writes a relationship. Migration 245's two
 * tables have no insert, update or delete policy for any role, which makes
 * this the only writer of an evaluation and means a coach cannot
 * manufacture a match for a member by hand either. The Relationship
 * Library itself keeps its rule intact: every definition is still written
 * through a coach's own session, so every definition still has an author,
 * and nothing in this file can add, edit or activate one.
 *
 * NO MEMBER ID IS EVER TAKEN FROM A REQUEST BODY. Every caller passes an
 * id it got from an authenticated session or read back out of the signal
 * table, and every match is computed from rows read back out of the
 * database rather than from anything a client posted.
 *
 * Returns null when the key is absent (local development, the test
 * environment) rather than throwing, and every caller degrades to doing
 * less: the coach's card is computed live on every read and is unaffected,
 * so a missing credential costs a ledger row and never a screen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '../supabase/env';
import { forgetRememberedReadsOnWrite } from '../supabase/readOnce';

export function patternEngineServiceRoleClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  try {
    const { url } = getSupabaseEnv();
    return createSupabaseClient(url, serviceRoleKey, {
      global: { fetch: forgetRememberedReadsOnWrite },
    });
  } catch (error) {
    console.error('patternEngineServiceRoleClient failed to build', error);
    return null;
  }
}
