/**
 * The server-side accessor for this member's Stress & Load Deep-Dive state.
 *
 * Deliberately NOT in app/actions/stressLoad.ts, for the same two reasons
 * lib/weekly-reflection/view.ts is not in its action file: a 'use server'
 * module may only export async functions, and this is a request-memoized
 * const, and a client component must never be able to call it (the client
 * only ever receives the already-rendered state as a prop).
 *
 * Memoized per request (lib/reactRequestCache.ts). Home renders the pop-up
 * chain and the persistent card in one pass and both ask for this; one set
 * of queries actually runs and both are handed the identical object.
 *
 * Never throws. Any failure resolves to "not offered", which is the same
 * fail-shut direction lib/stress-load/access.ts takes and for the same
 * reason.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildStressLoadState, type StressLoadState } from './service';

export const getMyStressLoadDeepDive = requestCache(
  async (): Promise<StressLoadState | null> => {
    try {
      const supabase = createClient();
      const user = await getCachedUser();
      if (!user) return null;
      return await buildStressLoadState(supabase, user.id);
    } catch (error) {
      console.error('getMyStressLoadDeepDive failed', error);
      return null;
    }
  }
);
