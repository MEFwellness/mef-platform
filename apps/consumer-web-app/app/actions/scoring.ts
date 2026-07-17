/**
 * apps/consumer-web-app/app/actions/scoring.ts
 *
 * The only place a Server Component reaches into the Root Score System.
 * Auth-guards, resolves the member's own local date, and delegates
 * everything else to lib/scoring/service.ts — no calculation, no
 * Supabase query beyond auth, lives in this file.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { getOrCalculateRootScore, getRootScoreHistory } from '@/lib/scoring/service';

/**
 * Today's Root/Momentum/Resilience snapshot, calculating it if today's
 * hasn't been computed yet. localDate/timezone are passed in by the
 * caller (already resolved once per page load, same pattern
 * app/dashboard/page.tsx already uses for check-ins) rather than
 * re-resolved here.
 */
export async function getMyRootScore(
  localDate: string,
  timezone: string
): Promise<RootScoreSnapshot | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return getOrCalculateRootScore(supabase, user.id, { localDate, timezone });
}

/** Oldest-first snapshot history for the Progress trend chart. */
export async function getMyRootScoreHistory(days = 90): Promise<RootScoreSnapshot[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return getRootScoreHistory(supabase, user.id, days);
}
