/**
 * The Weekly Root Review — orchestration.
 *
 * Three jobs, and none of them is deciding anything. The review is composed
 * by the pure function in ./compose.ts and worded by the pure functions in
 * ./copy.ts; this file supplies the inputs, persists what was composed, and
 * fires the one analytics event that belongs to delivery.
 *
 *   1. Decide whether this member has a week to be reviewed at all.
 *   2. Compose it once, on the first app open on or after her local Monday,
 *      and write the review row and the week focus row together.
 *   3. Hand back the rendered review, which is what both the pop-up and
 *      Home's persistent entry display.
 *
 * NO CRON, AND DELIBERATELY SO. The trigger is her own first render of the
 * new week, exactly as Part 1 resolves the previous day's outcomes on the
 * first render of a new day. A weekly job would have to guess her timezone
 * and would compose reviews for members who never came back; this composes
 * one at the moment it can actually be delivered.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { trackProductEvent } from '../analytics/track';
import { localDateStringFor } from '../time/localDate';
import { composeWeeklyReview } from './compose';
import { renderReview } from './copy';
import { claimWeekFocus, claimWeeklyReview, fetchWeeklyReview } from './data';
import { loadWeeklyReviewInputs } from './signals';
import type { RenderedReview, WeeklyReviewRecord } from './types';
import { weekStartFor } from './week';

export type WeeklyReviewState = {
  weekStart: string;
  record: WeeklyReviewRecord;
  review: RenderedReview;
  /** True on the render that genuinely composed it. Fires nothing on later renders. */
  justComposed: boolean;
};

export type WeeklyReviewContext = {
  /** Her stored profile timezone, resolved by the caller, never the server's. */
  timezone: string;
  /** auth.users.created_at. Decides whether she has a completed week to review. */
  accountCreatedAt: string | null;
};

/**
 * A member whose account did not exist before this week started has no
 * completed week for Root to look back at.
 *
 * Without this, someone who signed up on Tuesday would meet a "look back at
 * your week" on Wednesday about a week that was mostly not hers. The thin
 * review exists for a member with little data, not for a member with no
 * elapsed week, and those are different problems: the first is honest, the
 * second would be Root reviewing a week that had not happened.
 */
export function hasReviewableWeek(
  accountCreatedAt: string | null,
  timezone: string,
  weekStart: string
): boolean {
  if (!accountCreatedAt) return false;
  return localDateStringFor(accountCreatedAt, timezone) < weekStart;
}

/**
 * This week's review: the stored one if it exists, a newly composed one if
 * it does not and she is due one.
 *
 * Returns null when there is nothing to show, which is the ordinary state
 * for a brand-new account and for nobody else. Never throws: every caller
 * is a render.
 */
export async function buildWeeklyReviewState(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string,
  context: WeeklyReviewContext
): Promise<WeeklyReviewState | null> {
  try {
    const weekStart = weekStartFor(todayLocalDate);

    const { ok, record: existing } = await fetchWeeklyReview(supabase, memberId, weekStart);

    // The read did not work. Do nothing at all this render rather than treat
    // it as "she has no review yet": composing on a failed read would run the
    // composer's queries and attempt a write that cannot succeed, on every
    // render, and it is exactly the state between a deploy and its migration.
    if (!ok) return null;

    if (existing) {
      return {
        weekStart,
        record: existing,
        review: renderReview(
          existing.plan,
          weekStart,
          existing.answers,
          existing.acknowledgedAt !== null
        ),
        justComposed: false,
      };
    }

    if (!hasReviewableWeek(context.accountCreatedAt, context.timezone, weekStart)) return null;

    const inputs = await loadWeeklyReviewInputs(supabase, memberId, weekStart, todayLocalDate);
    const plan = composeWeeklyReview(inputs);

    const { record, created } = await claimWeeklyReview(supabase, memberId, weekStart, plan);
    if (!record) return null;

    // The focus row and the delivery event ride the SAME claim as the review
    // row, so a concurrent second render produces neither a second focus nor
    // a second delivered event. That is the same discipline Part 1 uses to
    // guarantee one coaching_action_delivered per day.
    if (created) {
      await claimWeekFocus(supabase, memberId, record.plan.focus);
      await trackProductEvent(supabase, {
        memberId,
        eventType: 'weekly_review_delivered',
        timezone: context.timezone,
        // Built additively rather than with `?? undefined`, because
        // exactOptionalPropertyTypes is on: an explicitly-undefined key and
        // an absent key are different types here, and the sanitizer's own
        // contract is about absent keys.
        payload: record.plan.focus.actionType
          ? { shape: record.shape, actionType: record.plan.focus.actionType }
          : { shape: record.shape },
      });
    }

    return {
      weekStart,
      record,
      review: renderReview(record.plan, weekStart, record.answers, record.acknowledgedAt !== null),
      justComposed: created,
    };
  } catch (error) {
    console.error('buildWeeklyReviewState failed', error);
    return null;
  }
}
