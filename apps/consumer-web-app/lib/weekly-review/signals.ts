/**
 * The Weekly Root Review — reading the inputs the composer decides between.
 *
 * Every function here is a READ of a system that already exists, through
 * that system's own published accessor. Nothing in this file computes a
 * trend, a tier, a correlation, a friction threshold, a plan classification
 * or a score:
 *
 *   consistency   daily_checkins_current, the same view every other daily
 *                 surface reads
 *   ledger        lib/coaching-direction/data.ts's own range accessor
 *   directions    lib/longitudinal-intelligence/data.ts's
 *                 listMemberPatternStates, whose rows already carry the
 *                 trend engine's classification AND the three-tier language
 *                 module's tier. Neither is re-derived.
 *   plan week     lib/reset-plan/data.ts's logs, classified by the plan's
 *                 own classifyResetPlanDay7Pattern
 *   friction      lib/coaching-direction/signals.ts's loadBehavioralFriction,
 *                 which is the read path Part 1 established, including its
 *                 service-role client and its graceful null
 *
 * Best-effort throughout: a failure anywhere resolves to that input being
 * absent rather than to an exception, because the caller is a page render
 * the member is already waiting on. An absent input costs the review one
 * observation, never the whole review.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listCoachingDecisionsInRange } from '../coaching-direction/data';
import { loadBehavioralFriction } from '../coaching-direction/signals';
import { listMemberPatternStates } from '../longitudinal-intelligence/data';
import type { LongitudinalSignal } from '../longitudinal-intelligence/types';
import { getCurrentResetPlan, listResetPlanDailyLogs } from '../reset-plan/data';
import { classifyResetPlanDay7Pattern } from '../reset-plan/copy';
import type { ReviewPlanWeek, WeeklyReviewInputs } from './compose';
import { reviewedRangeFor, withinRange } from './week';

/**
 * How many of her most recent Daily Resets are read.
 *
 * Bounded rather than all-time. The composer needs three things from this
 * list: how many are in the reviewed week, how many in the week before, and
 * the date of her first one for the history span. 400 rows is over a year
 * of perfect consistency, so the span is right for every real member, and a
 * bound stops one row-count from growing without limit.
 */
export const RESET_HISTORY_LIMIT = 400;

async function loadCheckinLocalDates(
  supabase: SupabaseClient,
  memberId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('local_date')
    .eq('user_id', memberId)
    .order('local_date', { ascending: false })
    .limit(RESET_HISTORY_LIMIT);

  if (error || !data) {
    if (error) console.error('loadCheckinLocalDates failed', error);
    return [];
  }
  return (data as { local_date: string }[]).map((row) => row.local_date);
}

/**
 * This week on her active Reset Plan, classified by the plan's own rules.
 *
 * A draft plan is deliberately not a plan week: she never finished agreeing
 * to it, which is the same distinction Part 1's rule 1 makes. A plan with no
 * focus signal cannot be described in the plan's own wording, so it is
 * treated as absent rather than described in a substitute wording invented
 * here.
 */
async function loadPlanWeek(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<ReviewPlanWeek | null> {
  const plan = await getCurrentResetPlan(supabase, memberId);
  if (!plan || plan.status !== 'active' || !plan.focusSignal) return null;

  const range = reviewedRangeFor(weekStart);
  const logs = (await listResetPlanDailyLogs(supabase, plan.id)).filter((log) =>
    withinRange(log.localDate, range)
  );

  const classified = classifyResetPlanDay7Pattern(logs);
  return {
    focusSignal: plan.focusSignal,
    pattern: classified.pattern,
    normalCount: classified.normalCount,
    difficultCount: classified.difficultCount,
    notTodayCount: classified.notTodayCount,
    loggedCount: classified.loggedCount,
  };
}

/**
 * Everything the pure composer needs, gathered in one pass.
 *
 * `todayLocalDate` is passed separately from `weekStart` and is only used by
 * the friction read, which is a rolling window ending today rather than a
 * week-bounded one. That is the friction service's own window and it is not
 * re-cut here: a behavior that has been stuck for three weeks is stuck this
 * week too, and narrowing its evidence to seven days would silently raise
 * its threshold.
 */
export async function loadWeeklyReviewInputs(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  todayLocalDate: string
): Promise<WeeklyReviewInputs> {
  const range = reviewedRangeFor(weekStart);

  const [checkinLocalDates, decisions, patternStates, planWeek, friction] = await Promise.all([
    loadCheckinLocalDates(supabase, memberId),
    listCoachingDecisionsInRange(supabase, memberId, range.from, range.to),
    listMemberPatternStates(supabase, memberId),
    loadPlanWeek(supabase, memberId, weekStart),
    loadBehavioralFriction(supabase, memberId, todayLocalDate),
  ]);

  return {
    weekStart,
    checkinLocalDates,
    decisions: decisions.map((decision) => ({
      localDate: decision.localDate,
      rule: decision.rule,
      actionType: decision.actionType,
      threadKey: decision.threadKey,
      memberResponse: decision.memberResponse,
    })),
    // The rows already carry their own state and tier. Passed through as
    // the LongitudinalSignal the three-tier language module takes, with no
    // re-classification of any kind.
    patternStates: [...patternStates.values()] as LongitudinalSignal[],
    planWeek,
    friction,
  };
}
