/**
 * The server-side accessor for this member's The Life You're Building
 * state.
 *
 * Deliberately NOT in app/actions/theLifeYoureBuilding.ts, for the same two
 * reasons the seven templates beside it keep theirs out of their action
 * files: a 'use server' module may only export async functions, and this is
 * a request-memoized const, and a client component must never be able to
 * call it (the client only ever receives the already-rendered state as a
 * prop).
 *
 * Memoized per request (lib/reactRequestCache.ts). Home renders the pop-up
 * chain and the persistent card in one pass and both ask for this; one set
 * of queries actually runs and both are handed the identical object. That
 * also means the follow-up check, which reads another template's rows, runs
 * at most once per request.
 *
 * Never throws. Any failure resolves to "not offered", which is the same
 * fail-shut direction lib/the-life-youre-building/access.ts takes and for
 * the same reason.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildTlybState, type TlybState } from './service';

export const getMyTheLifeYoureBuilding = requestCache(
  async (): Promise<TlybState | null> => {
    try {
      const supabase = createClient();
      const user = await getCachedUser();
      if (!user) return null;
      return await buildTlybState(supabase, user.id);
    } catch (error) {
      console.error('getMyTheLifeYoureBuilding failed', error);
      return null;
    }
  }
);
