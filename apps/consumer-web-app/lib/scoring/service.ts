/**
 * Root Score System — the domain-layer entry point everything else calls.
 * UI code and server actions never fetch inputs or calculate a score
 * directly; they call getOrCalculateRootScore / getRootScoreHistory here
 * and consume the normalized RootScoreSnapshot it returns.
 *
 * Caching rule (why this doesn't recalculate on every page render): a
 * snapshot already exists for today → return it as-is. Recalculation
 * only happens once per local_date per member, triggered either by the
 * first page load that day that asks for a score, or explicitly by an
 * event worth recomputing for (see the best-effort call added to
 * app/actions/checkin.ts's submitDailyCheckin). No cron/background job
 * is required for this first version — see the final report for why that
 * scope was deliberately deferred.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { calculateRootScoreSnapshot } from './calculate';
import {
  countSnapshotsBefore,
  getLatestSnapshotBefore,
  getSnapshotForDate,
  listSnapshotHistory,
  upsertSnapshot,
} from './data';
import {
  fetchBodyAssessmentsForScoring,
  fetchCheckinsForScoring,
  fetchMealQualityEventsForScoring,
  fetchMovementSessionsForScoring,
} from './fetchInputs';

export type ScoreDateParams = { localDate: string; timezone: string };

export async function calculateAndPersistRootScore(
  supabase: SupabaseClient,
  memberId: string,
  params: ScoreDateParams
): Promise<RootScoreSnapshot | null> {
  const [checkins, mealQualityEvents, movementSessions, bodyAssessments, previousSnapshot, priorSnapshotCount] =
    await Promise.all([
      fetchCheckinsForScoring(supabase, memberId, params.localDate),
      fetchMealQualityEventsForScoring(supabase, memberId, params.localDate),
      fetchMovementSessionsForScoring(supabase, memberId, params.localDate),
      fetchBodyAssessmentsForScoring(supabase, memberId, params.localDate),
      getLatestSnapshotBefore(supabase, memberId, params.localDate),
      countSnapshotsBefore(supabase, memberId, params.localDate),
    ]);

  const calculated = calculateRootScoreSnapshot({
    localDate: params.localDate,
    timezone: params.timezone,
    checkins,
    mealQualityEvents,
    movementSessions,
    bodyAssessments,
    previousSnapshot: previousSnapshot ? { root_score: previousSnapshot.root_score } : null,
    priorSnapshotCount,
  });

  return upsertSnapshot(supabase, memberId, params.localDate, params.timezone, calculated);
}

export async function getOrCalculateRootScore(
  supabase: SupabaseClient,
  memberId: string,
  params: ScoreDateParams,
  options: { forceRecalculate?: boolean } = {}
): Promise<RootScoreSnapshot | null> {
  if (!options.forceRecalculate) {
    const existing = await getSnapshotForDate(supabase, memberId, params.localDate);
    if (existing) return existing;
  }
  return calculateAndPersistRootScore(supabase, memberId, params);
}

/** Oldest-first, ready for a trend chart. */
export async function getRootScoreHistory(
  supabase: SupabaseClient,
  memberId: string,
  days = 90
): Promise<RootScoreSnapshot[]> {
  return listSnapshotHistory(supabase, memberId, days);
}
