/**
 * The server-side accessor for the whole priority view.
 *
 * Deliberately NOT in app/actions/priority.ts: a 'use server' module may
 * only export async functions, and this is a request-memoized const. It is
 * also not something a client component should ever be able to call — the
 * client only ever receives the already-computed view as a prop.
 *
 * Two callers, one engine:
 *   * the Today page passes what it already fetched (see its own call to
 *     buildPriorityView), so it pays no extra queries;
 *   * Home and the Root pop-up chain use this, because neither already
 *     holds the Coaching Brain's decision and the check-in history.
 *
 * Both paths end in the same `buildPriorityView` and therefore the same
 * `member_daily_priorities` row, which is what makes "Done in the pop-up
 * shows Done everywhere" true by construction rather than by syncing.
 *
 * Memoized per request (lib/reactRequestCache.ts). That is what makes it
 * safe for Home to render the pop-up chain and the inline card in the same
 * pass: both ask for the priority, one set of queries actually runs, and
 * both are handed the identical object. Same discipline
 * app/actions/rootMap.ts already uses for the Dashboard's three Root Map
 * consumers.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { getMyCoachingDecision } from '@/app/actions/coaching-brain';
import {
  getRecentCheckins,
  getTodaysCheckin,
  getTotalCheckinCount,
  resolveLocalDate,
} from '@/app/actions/checkin';
import { buildPriorityView, toTodaysFocusInput } from './service';
import { getDailyPriority } from './data';
import type { DailyPriorityRecord, PriorityView } from './types';
import { memberTimezone } from '../time/memberToday';

export const getMyPriorityView = requestCache(
  async (): Promise<PriorityView | null> => {
    try {
      const supabase = createClient();
      const user = await getCachedUser();
      if (!user) return null;

      const timezone = await memberTimezone(supabase, user.id);
      const localDate = await resolveLocalDate(
        new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
        false
      );

      const [decision, recentCheckins, todaysCheckin, totalCheckins] = await Promise.all([
        getMyCoachingDecision(timezone),
        getRecentCheckins(30),
        getTodaysCheckin(localDate),
        getTotalCheckinCount(),
      ]);

      return await buildPriorityView(supabase, user.id, localDate, {
        recentCheckins,
        todaysFocus: toTodaysFocusInput(decision),
        checkinDoneToday: todaysCheckin !== null,
        totalCheckins,
      });
    } catch (error) {
      console.error('getMyPriorityView failed', error);
      return null;
    }
  }
);

/**
 * THE DAY'S PRIORITY IS DECIDED BY THE CARD, NOT BY BROWSING (2026-08-27).
 *
 * `getMyPriorityView` above runs the engine and CLAIMS today's row as a
 * side effect. That is right for the three surfaces that actually show the
 * Priority Card (the Home pop-up, Home, and Today), and wrong everywhere
 * else: `TodaysFocusLine` is also rendered on Movement, the Root Map,
 * Recommendations and the Root Score, and Root's chat asks for the focus
 * too. So the day's one priority was being fixed by whichever screen she
 * happened to open first, which on most mornings was before she had done
 * her Daily Reset. Root then spent the day pointing at a decision made
 * without today's check-in in it.
 *
 * This is the read those surfaces use instead. It reports the decision if
 * one has been made and nothing at all if one has not, which is exactly
 * what TodaysFocusLine's own contract already says it does with a null.
 * It writes nothing, ever.
 *
 * Cheap on purpose: one indexed row read, no engine run. On Home the row
 * has already been claimed by the time this is called, so the focus line
 * still names the same priority the card above it is showing.
 */
export const getMyStoredPriority = requestCache(
  async (): Promise<DailyPriorityRecord | null> => {
    try {
      const supabase = createClient();
      const user = await getCachedUser();
      if (!user) return null;

      const timezone = await memberTimezone(supabase, user.id);
      const localDate = await resolveLocalDate(
        new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
        false
      );

      return await getDailyPriority(supabase, user.id, localDate);
    } catch (error) {
      console.error('getMyStoredPriority failed', error);
      return null;
    }
  }
);
