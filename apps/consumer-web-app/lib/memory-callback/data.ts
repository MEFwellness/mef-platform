/**
 * Root Presence System (Prompt 4), requirement 4: Memory Callbacks — the
 * data layer. Every fetcher here reuses an existing table/read pattern
 * rather than inventing a new one; the one genuinely new query is
 * `fetchCheckinTenure`'s unbounded first-check-in date (the existing
 * `firstEverCheckinDate` in lib/scoring/calculate.ts is bounded to a
 * 90-day scoring lookback window, the wrong shape for "how long have you
 * been here").
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getLoggedDayTotals } from '@/lib/member-counts/checkinCounts';
import { fetchLatestMemberGoalSelection } from '../member-goals/data';
import { listActiveCandidatePairs } from '../correlation-engine/data';
import { listMemberPatternStates } from '../longitudinal-intelligence/data';
import { buildFindings } from '../case-view/findings';
import type {
  GoalCallbackContext,
  TenureCallbackContext,
  Day3ContrastCallbackContext,
  FindingCallbackContext,
} from './types';

export async function fetchGoalCallbackContext(
  supabase: SupabaseClient,
  memberId: string
): Promise<GoalCallbackContext | null> {
  const selection = await fetchLatestMemberGoalSelection(supabase, memberId);
  if (!selection) return null;
  return {
    primaryGoal: selection.primaryGoal,
    goalsOther: selection.goalsOther,
    createdAt: selection.createdAt,
  };
}

export async function fetchTenureCallbackContext(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string
): Promise<TenureCallbackContext | null> {
  // ONE HELPER, NOT FOUR (Build 2, 2026-08-27). Root's own tenure sentence
  // and the number under Today's YOUR TOTALS used to be two separate
  // queries that happened to agree; they are now the same count, from
  // lib/member-counts/checkinCounts.ts.
  const { allTimeLoggedDays, firstLoggedLocalDate } = await getLoggedDayTotals(supabase, memberId);

  return {
    totalCheckins: allTimeLoggedDays,
    firstCheckinLocalDate: firstLoggedLocalDate,
    todayLocalDate,
  };
}

const EXPERIENCE_LABEL: Record<string, string> = {
  'core-values-snapshot': 'Core Values Snapshot experiment',
  'life-signal-check': 'Life Signal Check experiment',
  'readiness-pulse': 'Readiness Pulse experiment',
};

/** The member's most recent lifestyle experiment (any source experience) that actually has a real day-3 response logged. Reset Plan's own day-3 answer lives in a separate table (member_reset_plan_daily_logs) and isn't covered here — a conservative first pass, per this prompt's "a few high-confidence callback types done well" instruction. */
export async function fetchDay3ContrastCallbackContext(
  supabase: SupabaseClient,
  memberId: string
): Promise<Day3ContrastCallbackContext | null> {
  const { data: experiment, error: experimentError } = await supabase
    .from('lifestyle_experiments')
    .select('id, source_experience_key')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (experimentError || !experiment) return null;

  const { data: log, error: logError } = await supabase
    .from('cvs_experiment_daily_logs')
    .select('day3_response')
    .eq('experiment_id', experiment.id)
    .not('day3_response', 'is', null)
    .limit(1)
    .maybeSingle();

  if (logError || !log?.day3_response) return null;

  const sourceKey = experiment.source_experience_key as string | null;
  return {
    day3Response: log.day3_response as Day3ContrastCallbackContext['day3Response'],
    experienceLabel: (sourceKey && EXPERIENCE_LABEL[sourceKey]) ?? 'experiment',
  };
}

/** The member's oldest still-earned correlation finding, at least a week old — reuses the exact same read path Case View's own findings list uses (candidatePairsForGoals -> buildFindings), never a separate computation. Returns null for a member with no earned findings yet, or whose only findings are too recent to honestly call "weeks ago." */
export async function fetchFindingCallbackContext(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string
): Promise<FindingCallbackContext | null> {
  const goalSelection = await fetchLatestMemberGoalSelection(supabase, memberId);
  const memberGoalKeys = goalSelection?.goals ?? [];

  const [candidatePairs, patternStates] = await Promise.all([
    listActiveCandidatePairs(supabase),
    listMemberPatternStates(supabase, memberId),
  ]);

  const findings = buildFindings([...patternStates.values()], candidatePairs, memberGoalKeys);
  if (findings.length === 0) return null;

  const oldest = findings.reduce((a, b) => (a.computedAt < b.computedAt ? a : b));

  return {
    memberSentence: oldest.memberSentence,
    computedAt: oldest.computedAt,
    todayLocalDate,
  };
}
