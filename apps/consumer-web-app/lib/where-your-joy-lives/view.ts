/**
 * The server-side accessor for this member's Where Your Joy Lives state.
 *
 * Deliberately NOT in app/actions/whereYourJoyLives.ts, for the same two
 * reasons lib/owning-your-value/view.ts is not in its action file: a
 * 'use server' module may only export async functions, and this is a
 * request-memoized const, and a client component must never be able to call
 * it (the client only ever receives the already-rendered state as a prop).
 *
 * Memoized per request (lib/reactRequestCache.ts). Home renders the pop-up
 * chain and the persistent card in one pass and both ask for this; one set
 * of queries actually runs and both are handed the identical object.
 *
 * Never throws. Any failure resolves to "not offered", which is the same
 * fail-shut direction lib/where-your-joy-lives/access.ts takes and for the
 * same reason.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildWyjlState, type WyjlState } from './service';

export const getMyWhereYourJoyLives = requestCache(async (): Promise<WyjlState | null> => {
  try {
    const supabase = createClient();
    const user = await getCachedUser();
    if (!user) return null;
    return await buildWyjlState(supabase, user.id);
  } catch (error) {
    console.error('getMyWhereYourJoyLives failed', error);
    return null;
  }
});
