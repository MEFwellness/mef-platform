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
import type { PriorityView } from './types';

export const getMyPriorityView = requestCache(
  async (): Promise<PriorityView | null> => {
    try {
      const supabase = createClient();
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
