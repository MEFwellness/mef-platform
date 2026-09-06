/**
 * The server-side accessor for this member's Owning Your Value state.
 *
 * Deliberately NOT in app/actions/owningYourValue.ts, for the same two
 * reasons lib/stress-load/view.ts is not in its action file: a 'use server'
 * module may only export async functions, and this is a request-memoized
 * const, and a client component must never be able to call it (the client
 * only ever receives the already-rendered state as a prop).
 *
 * Memoized per request (lib/reactRequestCache.ts). Home renders the pop-up
 * chain and the persistent card in one pass and both ask for this; one set
 * of queries actually runs and both are handed the identical object.
 *
 * Never throws. Any failure resolves to "not offered", which is the same
 * fail-shut direction lib/owning-your-value/access.ts takes and for the
 * same reason.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildOyvState, type OyvState } from './service';

export const getMyOwningYourValue = requestCache(async (): Promise<OyvState | null> => {
  try {
    const supabase = createClient();
    const user = await getCachedUser();
    if (!user) return null;
    return await buildOyvState(supabase, user.id);
  } catch (error) {
    console.error('getMyOwningYourValue failed', error);
    return null;
  }
});
