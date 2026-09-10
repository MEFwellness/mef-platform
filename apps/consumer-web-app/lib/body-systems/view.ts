/**
 * The server side accessor for this member's MEF Body Systems Survey state.
 *
 * Deliberately NOT in app/actions/bodySystems.ts, for the same two reasons
 * lib/stress-load/view.ts is not in its action file: a 'use server' module
 * may only export async functions, and this is a request memoized const,
 * and a client component must never be able to call it.
 *
 * Memoized per request (lib/reactRequestCache.ts). Home renders the pop-up
 * chain and the persistent card in one pass and both ask for this; one set
 * of queries actually runs.
 *
 * Never throws. Any failure resolves to "not offered", which is the same
 * fail shut direction lib/body-systems/access.ts takes.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildBodySystemsState, type BodySystemsState } from './service';
import { loadMemberCopy } from './contentData';

export const getMyBodySystemsSurvey = requestCache(
  async (): Promise<BodySystemsState | null> => {
    try {
      const supabase = createClient();
      const user = await getCachedUser();
      if (!user) return null;
      return await buildBodySystemsState(supabase, user.id);
    } catch (error) {
      console.error('getMyBodySystemsSurvey failed', error);
      return null;
    }
  }
);

/**
 * The member facing copy rows, memoized per request.
 *
 * Home renders the pop-up chain and the persistent card in one pass and
 * both need the same words; this costs one query between them. It reads
 * ONLY the 'member.' audience rows, which is both what the query asks for
 * and what the database's own policy would allow a member session anyway.
 */
export const getBodySystemsMemberCopy = requestCache(
  async (): Promise<Record<string, string>> => {
    try {
      return await loadMemberCopy(createClient());
    } catch (error) {
      console.error('getBodySystemsMemberCopy failed', error);
      return {};
    }
  }
);
