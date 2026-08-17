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
import { addDaysToLocalDate } from '../feed/dateMath';
import { EVIDENCE_WINDOW_DAYS } from '../member-interpretation/config';
import { computeDataFloor } from '../member-interpretation/dataFloor';
import { calculateRootScoreSnapshot } from './calculate';
import {
  getLatestSnapshotBefore,
  getSnapshotForDate,
  listSnapshotHistory,
  upsertSnapshot,
} from './data';
import {
  fetchActiveRegistryFindingsForScoring,
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
  const [
    checkins,
    mealQualityEvents,
    movementSessions,
    bodyAssessments,
    activeRegistryFindings,
    previousSnapshot,
  ] = await Promise.all([
    fetchCheckinsForScoring(supabase, memberId, params.localDate),
    fetchMealQualityEventsForScoring(supabase, memberId, params.localDate),
    fetchMovementSessionsForScoring(supabase, memberId, params.localDate),
    fetchBodyAssessmentsForScoring(supabase, memberId, params.localDate),
    fetchActiveRegistryFindingsForScoring(supabase, memberId),
    getLatestSnapshotBefore(supabase, memberId, params.localDate),
  ]);

  const calculated = calculateRootScoreSnapshot({
    localDate: params.localDate,
    timezone: params.timezone,
    checkins,
    mealQualityEvents,
    movementSessions,
    bodyAssessments,
    activeRegistryFindings,
    previousSnapshot: previousSnapshot ? { root_score: previousSnapshot.root_score } : null,
    // loggedDays is left to calculateRootScoreSnapshot's own count over the
    // check-ins it was already handed, rather than a second query that
    // could disagree with them.
  });

  return upsertSnapshot(supabase, memberId, params.localDate, params.timezone, calculated);
}

/**
 * THE DATA FLOOR, APPLIED AT READ TIME.
 *
 * A snapshot is a per-day row, written once and read all day, and it holds a
 * VERDICT: "Your recovery is a real strength, while movement consistency is
 * your clearest opportunity." Every stored row written before the
 * interpretation build holds one that was produced with no minimum data
 * requirement at all.
 *
 * `buildExplanation` is fixed and every row written from now on respects the
 * floor. That is not enough on its own: a member reading Home this morning
 * is reading a row written this morning by the old code, and a member
 * reading it a month from now could still be reading a row written today.
 * So the floor is re-applied on the way OUT, every time, and a stale
 * flattering verdict cannot survive a page load.
 *
 * The same lesson as the Daily Brief: a per-day cache holding a claim about
 * a member has to be re-checked at read time, not only at write time.
 *
 * Only the two verdict fields are replaced. `positive_factors`,
 * `limiting_factors` and the per-domain explanations are facts about her
 * data ("0 completed sessions against a target of 17 this window"), not
 * verdicts about her, and they stay exactly as computed.
 */
async function applyDataFloor(
  supabase: SupabaseClient,
  memberId: string,
  snapshot: RootScoreSnapshot | null
): Promise<RootScoreSnapshot | null> {
  if (!snapshot || snapshot.root_score === null) return snapshot;

  const since = addDaysToLocalDate(snapshot.local_date, -(EVIDENCE_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('local_date')
    .eq('user_id', memberId)
    .gte('local_date', since)
    .lte('local_date', snapshot.local_date);

  if (error) {
    console.error('applyDataFloor failed', error);
    return snapshot;
  }

  const loggedDays = new Set(
    ((data ?? []) as Array<{ local_date: string }>).map((row) => row.local_date)
  ).size;
  const floor = computeDataFloor(loggedDays);
  if (floor.met) return snapshot;

  return {
    ...snapshot,
    explanation_summary: floor.statement,
    strongest_domain: null,
    primary_opportunity_domain: null,
  };
}

export async function getOrCalculateRootScore(
  supabase: SupabaseClient,
  memberId: string,
  params: ScoreDateParams,
  options: { forceRecalculate?: boolean } = {}
): Promise<RootScoreSnapshot | null> {
  if (!options.forceRecalculate) {
    const existing = await getSnapshotForDate(supabase, memberId, params.localDate);
    if (existing) return applyDataFloor(supabase, memberId, existing);
  }
  return applyDataFloor(
    supabase,
    memberId,
    await calculateAndPersistRootScore(supabase, memberId, params)
  );
}

/** Oldest-first, ready for a trend chart. */
export async function getRootScoreHistory(
  supabase: SupabaseClient,
  memberId: string,
  days = 90
): Promise<RootScoreSnapshot[]> {
  return listSnapshotHistory(supabase, memberId, days);
}
