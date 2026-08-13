/**
 * The Weekly Root Review — the two tables this build owns
 * (member_weekly_reviews and member_week_focus, migration 151).
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what, and
 * a failed read returns a safe empty value rather than throwing, since
 * every caller is on a page render the member is already waiting on.
 *
 * Nothing in this file writes a sentence. Both jsonb columns pass through
 * ./plan.ts's closed allowlists on the way in AND on the way out, so a row
 * written by any means renders only what the current vocabulary permits.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoachingActionType } from '../coaching-direction/types';
import { isCoachingActionType } from '../coaching-direction/types';
import { sanitizeAnswers, sanitizeFocusEvidence, sanitizePlan } from './plan';
import { isFocusReason } from './types';
import type { ReviewPlan, WeeklyReviewRecord, WeekFocus } from './types';

// ---------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------

const REVIEW_COLUMNS =
  'id, week_start, shape, plan, answers, delivered_at, viewed_at, acknowledged_at';

type ReviewRow = {
  id: string;
  week_start: string;
  shape: string;
  plan: unknown;
  answers: unknown;
  delivered_at: string | null;
  viewed_at: string | null;
  acknowledged_at: string | null;
};

function fromReviewRow(row: ReviewRow): WeeklyReviewRecord | null {
  const plan = sanitizePlan(row.plan, row.week_start);
  // A row whose plan cannot be sanitized into something renderable is
  // treated as absent rather than rendered half way. That can only happen
  // to a hand-edited row or one written by a future build with a wider
  // vocabulary, and in both cases showing nothing is right.
  if (!plan) return null;
  return {
    id: row.id,
    weekStart: row.week_start,
    shape: row.shape === 'thin' ? 'thin' : 'full',
    plan,
    answers: sanitizeAnswers(row.answers),
    deliveredAt: row.delivered_at,
    viewedAt: row.viewed_at,
    acknowledgedAt: row.acknowledged_at,
  };
}

/**
 * The read, with "no row" and "the read did not work" kept apart.
 *
 * They are genuinely different facts and collapsing them is not safe here,
 * because the caller's response to "no row" is to COMPOSE one. A read that
 * failed (a missing table between a deploy and its migration, a transient
 * error, a policy change) would then look like a member with no review yet,
 * and every render would run the composer's five queries and attempt a write
 * that cannot succeed.
 *
 * `ok: false` means: do nothing this render. That is the same fail-closed
 * discipline claimDailyPriority uses when it cannot confirm it owns the row.
 */
export async function fetchWeeklyReview(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<{ ok: boolean; record: WeeklyReviewRecord | null }> {
  const { data, error } = await supabase
    .from('member_weekly_reviews')
    .select(REVIEW_COLUMNS)
    .eq('member_id', memberId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) {
    console.error('fetchWeeklyReview failed', error);
    return { ok: false, record: null };
  }
  if (!data) return { ok: true, record: null };
  return { ok: true, record: fromReviewRow(data as unknown as ReviewRow) };
}

/** The row, or null for either reason. For callers that genuinely only need the row. */
export async function getWeeklyReview(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<WeeklyReviewRecord | null> {
  return (await fetchWeeklyReview(supabase, memberId, weekStart)).record;
}

/**
 * Writes this week's review, if this week has no row yet.
 *
 * Deliberately an insert-if-absent, matching claimDailyPriority's and
 * recordCoachingDecision's own discipline for exactly the same reason: once
 * Root has composed a week's review, that review is fixed for the week, and
 * a concurrent second render must not be able to rewrite it or produce a
 * second row. `delivered_at` is set here, on the insert, because composing
 * the review IS delivering it into the pop-up chain.
 *
 * Returns the row either way, so a caller that lost the race still gets the
 * review that won it.
 */
export async function claimWeeklyReview(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  plan: ReviewPlan
): Promise<{ record: WeeklyReviewRecord | null; created: boolean }> {
  const { data, error } = await supabase
    .from('member_weekly_reviews')
    .upsert(
      {
        member_id: memberId,
        week_start: weekStart,
        shape: plan.shape,
        plan,
        answers: {},
        delivered_at: new Date().toISOString(),
      },
      { onConflict: 'member_id,week_start', ignoreDuplicates: true }
    )
    .select(REVIEW_COLUMNS);

  if (error) {
    console.error('claimWeeklyReview failed', error);
    return { record: null, created: false };
  }

  const inserted = (data as unknown as ReviewRow[] | null)?.[0];
  if (inserted) return { record: fromReviewRow(inserted), created: true };

  // The insert was a genuine no-op, which is the concurrent-render case.
  // Read the row that won. Returning it from the write above on the happy
  // path is the same fix migration 150's own live verification found
  // necessary for claimDailyPriority: Next.js patches global fetch, and a
  // re-read byte-identical to an earlier empty read can be served from that
  // cache in a production build.
  return { record: await getWeeklyReview(supabase, memberId, weekStart), created: false };
}

/**
 * Claims the "she actually saw it" moment, atomically, exactly once per
 * week.
 *
 * The `is null` guard is what makes it once: the review can render three
 * times in one load (the pop-up, Home's persistent entry, a refresh), and
 * no client-side dedupe could decide this correctly. Returns true only for
 * the render that genuinely won, which is the render that fires
 * weekly_review_viewed.
 */
export async function claimWeeklyReviewViewed(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_weekly_reviews')
    .update({ viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .eq('week_start', weekStart)
    .is('viewed_at', null)
    .select('id');

  if (error) {
    console.error('claimWeeklyReviewViewed failed', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** The single acknowledge action. Same atomic-claim shape, so one week produces one completion event. */
export async function claimWeeklyReviewAcknowledged(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_weekly_reviews')
    .update({ acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .eq('week_start', weekStart)
    .is('acknowledged_at', null)
    .select('id');

  if (error) {
    console.error('claimWeeklyReviewAcknowledged failed', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Records one answer.
 *
 * Read-modify-write on the answers map rather than a jsonb merge, so the
 * sanitizer runs over the WHOLE map every time: a stale value that would no
 * longer be accepted cannot survive by never being touched again. The map
 * has at most two keys, so there is nothing to gain from being cleverer.
 *
 * Returns false when the question was not one this review actually asked,
 * which is the guard that matters: the answer arrives from a client
 * component.
 */
export async function recordWeeklyReviewAnswer(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  questionKey: string,
  option: string
): Promise<boolean> {
  const review = await getWeeklyReview(supabase, memberId, weekStart);
  if (!review) return false;
  if (!review.plan.questionKeys.includes(questionKey)) return false;

  const answers = sanitizeAnswers({ ...review.answers, [questionKey]: option });
  if (answers[questionKey] !== option) return false;

  const { error } = await supabase
    .from('member_weekly_reviews')
    .update({ answers, updated_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .eq('week_start', weekStart);

  if (error) {
    console.error('recordWeeklyReviewAnswer failed', error);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------
// Week focus
// ---------------------------------------------------------------------

const FOCUS_COLUMNS = 'week_start, focus_action_type, focus_thread_key, source_evidence';

type FocusRow = {
  week_start: string;
  focus_action_type: string | null;
  focus_thread_key: string | null;
  source_evidence: unknown;
};

function fromFocusRow(row: FocusRow, reason: WeekFocus['reason']): WeekFocus {
  return {
    weekStart: row.week_start,
    actionType: isCoachingActionType(row.focus_action_type)
      ? (row.focus_action_type as CoachingActionType)
      : null,
    threadKey: row.focus_thread_key,
    reason,
    sourceEvidence: sanitizeFocusEvidence((row.source_evidence as Record<string, unknown>) ?? {}),
  };
}

/**
 * This week's focus.
 *
 * The reason slug lives on the review's plan rather than on this row, so it
 * is read from there when available and falls back to the neutral first
 * reason otherwise. That is deliberate: the reason exists to be SAID in the
 * review, and the daily engine has no use for it, so duplicating it into
 * the row the engine reads would be a second copy of the same fact.
 */
export async function getWeekFocus(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  reason: WeekFocus['reason'] = 'engagement_thin'
): Promise<WeekFocus | null> {
  const { data, error } = await supabase
    .from('member_week_focus')
    .select(FOCUS_COLUMNS)
    .eq('member_id', memberId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('getWeekFocus failed', error);
    return null;
  }
  return fromFocusRow(data as unknown as FocusRow, isFocusReason(reason) ? reason : 'engagement_thin');
}

/**
 * Writes the week's focus, once, alongside the review.
 *
 * Insert-if-absent for the same reason the review row is: one focus per
 * week, decided once, never rewritten by a later render inside the same
 * week.
 */
export async function claimWeekFocus(
  supabase: SupabaseClient,
  memberId: string,
  focus: WeekFocus
): Promise<boolean> {
  const { error } = await supabase.from('member_week_focus').upsert(
    {
      member_id: memberId,
      week_start: focus.weekStart,
      focus_action_type: focus.actionType,
      focus_thread_key: focus.threadKey,
      source_evidence: sanitizeFocusEvidence(focus.sourceEvidence),
    },
    { onConflict: 'member_id,week_start', ignoreDuplicates: true }
  );

  if (error) {
    console.error('claimWeekFocus failed', error);
    return false;
  }
  return true;
}

/**
 * The test-account-only reset, used by the force-redelivery route so a
 * verification pass can watch the review arrive more than once.
 *
 * The is_test restriction is NOT here. It is enforced twice, in the two
 * places that can be checked independently: the route handler that calls
 * this, and migration 151's own delete policies, which grant the delete
 * only to a member whose profiles.is_test is true. This function is
 * deliberately dumb so that neither guard can be mistaken for the other.
 */
export async function deleteWeeklyReviewForWeek(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<{ reviews: number; focus: number }> {
  const { data: reviews } = await supabase
    .from('member_weekly_reviews')
    .delete()
    .eq('member_id', memberId)
    .eq('week_start', weekStart)
    .select('id');

  const { data: focus } = await supabase
    .from('member_week_focus')
    .delete()
    .eq('member_id', memberId)
    .eq('week_start', weekStart)
    .select('id');

  return { reviews: reviews?.length ?? 0, focus: focus?.length ?? 0 };
}
