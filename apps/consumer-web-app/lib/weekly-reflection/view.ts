/**
 * The server-side accessor for this member's Weekly Reflection state.
 *
 * Deliberately NOT in app/actions/weeklyReflection.ts, for the same two
 * reasons lib/weekly-review/view.ts and lib/priority/view.ts are not in
 * their own action files: a 'use server' module may only export async
 * functions, and this is a request-memoized const, and a client component
 * must never be able to call it (the client only ever receives the
 * already-rendered state as a prop).
 *
 * Memoized per request (lib/reactRequestCache.ts). Home renders the pop-up
 * chain and the persistent card in one pass and both ask for this; one set
 * of queries actually runs, one composition happens, and both are handed
 * the identical object.
 *
 * Never throws. Any failure resolves to "not offered", which is the same
 * fail-shut direction lib/weekly-reflection/access.ts takes and for the
 * same reason.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { memberTimezone } from '../time/memberToday';
import { todaysLocalDate } from '../time/localDate';
import { buildWeeklyReflectionState, type WeeklyReflectionState } from './service';

export const getMyWeeklyReflection = requestCache(
  async (): Promise<WeeklyReflectionState | null> => {
    try {
      const supabase = createClient();
      const user = await getCachedUser();
      if (!user) return null;

      const timezone = await memberTimezone(supabase, user.id);
      return await buildWeeklyReflectionState(supabase, user.id, todaysLocalDate(timezone));
    } catch (error) {
      console.error('getMyWeeklyReflection failed', error);
      return null;
    }
  }
);
