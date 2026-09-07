/**
 * The server-side accessor for this member's What You Put Down state.
 *
 * Deliberately NOT in app/actions/whatYouPutDown.ts, for the same two
 * reasons the five templates beside it keep theirs out of their action
 * files: a 'use server' module may only export async functions, and this is
 * a request-memoized const, and a client component must never be able to
 * call it (the client only ever receives the already-rendered state as a
 * prop).
 *
 * Memoized per request (lib/reactRequestCache.ts). Home renders the pop-up
 * chain and the persistent card in one pass and both ask for this; one set
 * of queries actually runs and both are handed the identical object.
 *
 * Never throws. Any failure resolves to "not offered", which is the same
 * fail-shut direction lib/what-you-put-down/access.ts takes and for the
 * same reason.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildWypdState, type WypdState } from './service';

export const getMyWhatYouPutDown = requestCache(async (): Promise<WypdState | null> => {
  try {
    const supabase = createClient();
    const user = await getCachedUser();
    if (!user) return null;
    return await buildWypdState(supabase, user.id);
  } catch (error) {
    console.error('getMyWhatYouPutDown failed', error);
    return null;
  }
});
