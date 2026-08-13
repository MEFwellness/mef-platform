'use server';

/**
 * The Weekly Root Review — the server actions behind its one acknowledge
 * button, its at-most-two question answers, and its three read-side
 * analytics events.
 *
 * Everything analytics here goes through lib/analytics/track.ts, which goes
 * through lib/events/service.ts's recordMemberEvent, the one write path into
 * member_wellness_events. No second pipeline, and every payload value is
 * validated against the closed allowlists in lib/analytics/surfaces.ts
 * before it can reach the database, because these actions are called from a
 * client component and their arguments therefore arrive from the browser.
 *
 * The fourth event, weekly_review_delivered, deliberately does NOT live
 * here: delivery happens on the server render that composes the review, and
 * it rides that composition's own atomic claim (lib/weekly-review/service.ts).
 * A client could not honestly assert it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { trackProductEvent } from '@/lib/analytics/track';
import { isWeeklyReviewQuestionKey, isWeeklyReviewShape } from '@/lib/analytics/surfaces';
import { isAnswerOption } from '@/lib/weekly-review/questions';
import {
  claimWeeklyReviewAcknowledged,
  claimWeeklyReviewViewed,
  getWeeklyReview,
  recordWeeklyReviewAnswer,
} from '@/lib/weekly-review/data';
import { weekStartFor } from '@/lib/weekly-review/week';
import { resolveLocalDate } from './checkin';

type MemberContext = { memberId: string; timezone: string; weekStart: string };

async function memberContext(supabase: SupabaseClient): Promise<MemberContext | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();

  const timezone = profile?.timezone ?? 'America/New_York';
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
  return { memberId: user.id, timezone, weekStart: weekStartFor(localDate) };
}

/**
 * The review reached her screen.
 *
 * Fired from the client after paint, same reason app/actions/analytics.ts's
 * own surface-view action is an action rather than tracking inside the
 * server render.
 *
 * Exactly one `weekly_review_viewed` per member per week, guaranteed by
 * `claimWeeklyReviewViewed`'s conditional UPDATE rather than by a
 * client-side dedupe window. That matters because the review can render
 * twice in one load (the pop-up and Home's persistent entry mount in the
 * same paint), so no client-side timer could decide this correctly.
 */
export async function trackWeeklyReviewViewedAction(): Promise<void> {
  try {
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return;

    const review = await getWeeklyReview(supabase, ctx.memberId, ctx.weekStart);
    if (!review) return;

    const won = await claimWeeklyReviewViewed(supabase, ctx.memberId, ctx.weekStart);
    if (!won) return;

    await trackProductEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'weekly_review_viewed',
      timezone: ctx.timezone,
      payload: isWeeklyReviewShape(review.shape) ? { shape: review.shape } : {},
    });
  } catch (error) {
    console.error('trackWeeklyReviewViewedAction failed', error);
  }
}

/**
 * The single acknowledge action.
 *
 * Idempotent by construction: the claim is conditional on
 * acknowledged_at still being null, so a double tap or a retried request
 * records one completion and fires one event.
 */
export async function acknowledgeWeeklyReviewAction(): Promise<{ ok: boolean }> {
  try {
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return { ok: false };

    const review = await getWeeklyReview(supabase, ctx.memberId, ctx.weekStart);
    if (!review) return { ok: false };

    const won = await claimWeeklyReviewAcknowledged(supabase, ctx.memberId, ctx.weekStart);
    if (won) {
      await trackProductEvent(supabase, {
        memberId: ctx.memberId,
        eventType: 'weekly_review_completed',
        timezone: ctx.timezone,
        payload: isWeeklyReviewShape(review.shape) ? { shape: review.shape } : {},
      });
    }
    // Already acknowledged is still success from the member's point of
    // view: the review is acknowledged either way, and reporting a failure
    // would make the button look broken on a retry.
    return { ok: true };
  } catch (error) {
    console.error('acknowledgeWeeklyReviewAction failed', error);
    return { ok: false };
  }
}

/**
 * One answer to one of the review's questions.
 *
 * Three independent guards, because both arguments arrive from the browser:
 * the question key must be one of the two that exist, the option must be
 * one of that question's own three, and
 * lib/weekly-review/data.ts's own write additionally refuses a question
 * THIS review did not ask.
 *
 * The analytics event carries the question key and nothing else. Her answer
 * is stored on her own review row as behavioral context and never travels
 * to an event, which is enforced by ProductAnalyticsPayload having no field
 * it could occupy.
 */
export async function answerWeeklyReviewQuestionAction(
  questionKey: string,
  option: string
): Promise<{ ok: boolean }> {
  try {
    if (!isWeeklyReviewQuestionKey(questionKey)) return { ok: false };
    if (!isAnswerOption(questionKey, option)) return { ok: false };

    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return { ok: false };

    const ok = await recordWeeklyReviewAnswer(
      supabase,
      ctx.memberId,
      ctx.weekStart,
      questionKey,
      option
    );
    if (!ok) return { ok: false };

    await trackProductEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'weekly_review_question_answered',
      timezone: ctx.timezone,
      payload: { questionKey },
    });
    return { ok: true };
  } catch (error) {
    console.error('answerWeeklyReviewQuestionAction failed', error);
    return { ok: false };
  }
}
