/**
 * Adaptive Coaching Direction — the one place a service-role client is
 * built for this feature.
 *
 * Two call sites need one, and both need it for the same documented reason
 * rather than as a workaround:
 *
 *   the friction signals (Part 1, ./signals.ts) and the before/after
 *   comparison primitive (Part 3, ./gradesService.ts) both run behind
 *   analytics_assert_admin, which a member's own session cannot pass.
 *   Migration 149's own authorization comment names this case explicitly:
 *   "a service-role connection (the app's own cron routes, and later the
 *   Engagement Agent) is already trusted infrastructure".
 *
 *   an analytics event written on a COACH's action still belongs to the
 *   member's own event stream, and member_wellness_events (migration 63)
 *   has a member insert policy and a coach READ policy, with no coach
 *   insert policy. Widening that table's write surface for one behavioral
 *   event would be the wrong trade; writing it through the same trusted
 *   connection, with source 'coach', is not.
 *
 * The functions are SECURITY INVOKER and every client built here is used
 * only with a member id the caller obtained from an authenticated session.
 *
 * Returns null when the key is absent (local development, and the test
 * environment) rather than throwing. Every caller degrades to doing less
 * rather than to failing: rule 5 declines, a grading pass records counts
 * without comparisons, an analytics event is not written. A missing
 * analytics credential must never cost a member her card.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '../supabase/env';

export function coachingServiceRoleClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  try {
    const { url } = getSupabaseEnv();
    return createSupabaseClient(url, serviceRoleKey);
  } catch (error) {
    console.error('coachingServiceRoleClient failed to build', error);
    return null;
  }
}
