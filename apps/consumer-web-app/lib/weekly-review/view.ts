/**
 * The server-side accessor for this week's review.
 *
 * Deliberately NOT in app/actions/weeklyReview.ts, for the same two reasons
 * lib/priority/view.ts is not in app/actions/priority.ts: a 'use server'
 * module may only export async functions, and this is a request-memoized
 * const, and a client component must never be able to call it (the client
 * only ever receives the already-rendered review as a prop).
 *
 * Memoized per request (lib/reactRequestCache.ts). That is what makes it
 * safe for Home to render the pop-up chain and the persistent entry in the
 * same pass: both ask for the review, one set of queries actually runs, one
 * composition happens, and both are handed the identical object. Same
 * discipline getMyPriorityView already uses.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { resolveLocalDate } from '@/app/actions/checkin';
import { buildWeeklyReviewState, type WeeklyReviewState } from './service';
import { memberTimezone } from '../time/memberToday';

export const getMyWeeklyReview = requestCache(
  async (): Promise<WeeklyReviewState | null> => {
    try {
      const supabase = createClient();
      const user = await getCachedUser();
      if (!user) return null;

      const timezone = await memberTimezone(supabase, user.id);
      const localDate = await resolveLocalDate(
        new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
        false
      );

      return await buildWeeklyReviewState(supabase, user.id, localDate, {
        timezone,
        accountCreatedAt: user.created_at ?? null,
      });
    } catch (error) {
      console.error('getMyWeeklyReview failed', error);
      return null;
    }
  }
);
