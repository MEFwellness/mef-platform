/**
 * Coaching Intelligence Engine — orchestrator. The one entry point every
 * caller (the server action, a future cron pre-warm job) should use.
 *
 * Caching / performance: generation is idempotent per (member, local_date)
 * — same "generate lazily on first page load that day, cheap to re-read
 * after that" posture as lib/coaching-engine/service.ts's Morning Brief
 * and lib/feed/service.ts's Daily Feed. The (member_id, local_date,
 * category) unique constraint on coaching_insights is the real
 * concurrency guard (a duplicate insert from a race loses to '23505' and
 * is treated as "someone else already generated this," not an error —
 * see lib/coaching-insights/data.ts). Every active source is fetched
 * exactly once per generation and the same in-memory observation set is
 * reused by all five category generators, rather than each generator
 * re-querying — the concrete form "avoid unnecessary queries" takes here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoachingInsight, CoachingInsightCategory } from '@mef/shared-types-contracts';
import { todaysLocalDate } from '@/lib/time/localDate';
import { listActiveCoachingSourceProviders } from './sources/registry';
import { getCoachingSafetyGate } from './safety';
import { insertCoachingInsight, listCoachingInsightsForDate } from './data';
import {
  generateRecentPattern,
  generateSmallWin,
  generateThingsWorthWatching,
  generateTodaysInsight,
  generateWeeklyObservation,
  generateWeeklyTrendObservation,
} from './levels';
import type { CoachingInsightDraft, CoachingObservation } from './types';

// Wide enough to cover Level 4's 4-week trend plus a margin for sparse
// loggers to still accumulate Level 2/3's minimum instance counts — same
// 95-day figure lib/intelligence-engine/profile.ts's own check-in window
// already establishes as this codebase's standard "enough history to
// reason about, not so much it's slow" bound.
const OBSERVATION_WINDOW_DAYS = 95;

export type CoachingInsightsResult = {
  insights: CoachingInsight[];
  safetyMessage: string | null;
};

function windowStart(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() - OBSERVATION_WINDOW_DAYS);
  return date.toISOString().slice(0, 10);
}

async function fetchAllObservations(
  supabase: SupabaseClient,
  memberId: string,
  today: string
): Promise<CoachingObservation[]> {
  const range = { from: windowStart(today), to: today };
  const perSource = await Promise.all(
    listActiveCoachingSourceProviders().map((provider) =>
      provider.fetchObservations(supabase, memberId, range)
    )
  );
  return perSource.flat();
}

function generateDrafts(
  observations: CoachingObservation[],
  today: string
): Partial<Record<CoachingInsightCategory, CoachingInsightDraft>> {
  const drafts: Partial<Record<CoachingInsightCategory, CoachingInsightDraft>> = {};

  const todaysInsight = generateTodaysInsight(observations, today);
  if (todaysInsight) drafts.todays_insight = todaysInsight;

  const recentPattern = generateRecentPattern(observations);
  if (recentPattern) drafts.recent_pattern = recentPattern;

  // "Weekly Observation" prefers the stronger, multi-week Level 4 trend
  // when there's enough history to support one; a member without 4 weeks
  // of history yet can still get a lighter, real Level 2 read on just the
  // last 7 days rather than nothing — never the reverse (a 7-day read is
  // never dressed up as a 4-week trend).
  const weeklyTrend = generateWeeklyTrendObservation(observations, today);
  const weeklyObservation = weeklyTrend ?? generateWeeklyObservation(observations, today);
  if (weeklyObservation) drafts.weekly_observation = weeklyObservation;

  const watch = generateThingsWorthWatching(observations);
  if (watch) drafts.watch = watch;

  const smallWin = generateSmallWin(observations);
  if (smallWin) drafts.small_win = smallWin;

  return drafts;
}

export async function getOrGenerateTodaysCoachingInsights(
  supabase: SupabaseClient,
  memberId: string,
  timezone: string
): Promise<CoachingInsightsResult> {
  const today = todaysLocalDate(timezone);

  const existing = await listCoachingInsightsForDate(supabase, memberId, today);
  if (existing.length > 0) {
    return { insights: existing, safetyMessage: null };
  }

  const safetyGate = await getCoachingSafetyGate(supabase, memberId);
  if (safetyGate.suppressAll) {
    return { insights: [], safetyMessage: safetyGate.safetyMessage };
  }

  let observations = await fetchAllObservations(supabase, memberId, today);
  if (safetyGate.suppressNutrition) {
    observations = observations.filter((o) => o.sourceId !== 'food_lens');
  }

  const drafts = generateDrafts(observations, today);

  await Promise.all(
    (Object.entries(drafts) as Array<[CoachingInsightCategory, CoachingInsightDraft]>).map(
      ([category, draft]) => insertCoachingInsight(supabase, memberId, today, category, draft)
    )
  );

  // Re-read rather than trust the insert results directly: under a
  // concurrent race (two tabs open on a new day) one of the two calls
  // above loses the unique-constraint race and returns null, so a
  // straight read afterward is the simplest way to return the one
  // authoritative set either request actually persisted.
  const persisted = await listCoachingInsightsForDate(supabase, memberId, today);
  return { insights: persisted, safetyMessage: null };
}
