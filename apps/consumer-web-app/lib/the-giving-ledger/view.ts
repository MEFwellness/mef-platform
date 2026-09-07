/**
 * The server-side accessor for this member's The Giving Ledger state.
 *
 * Deliberately NOT in app/actions/theGivingLedger.ts, for the same two
 * reasons the two templates beside it keep theirs out of their action
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
 * fail-shut direction lib/the-giving-ledger/access.ts takes and for the
 * same reason.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildTglState, type TglState } from './service';

export const getMyTheGivingLedger = requestCache(async (): Promise<TglState | null> => {
  try {
    const supabase = createClient();
    const user = await getCachedUser();
    if (!user) return null;
    return await buildTglState(supabase, user.id);
  } catch (error) {
    console.error('getMyTheGivingLedger failed', error);
    return null;
  }
});
