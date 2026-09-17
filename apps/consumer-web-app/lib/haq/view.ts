/**
 * The server side accessor for this member's Health Appraisal state,
 * memoized per request so the shelf, the Home cards and the route all read
 * the same answer.
 *
 * Not in an actions file for the reason lib/breathing-check-in/view.ts
 * gives: a 'use server' module may only export async functions, and a
 * client component must never be able to call this.
 *
 * Never throws. Any failure resolves to "not offered".
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildHaqState } from './service';
import type { HaqState } from './access';

export const getMyHaq = requestCache(async (): Promise<HaqState | null> => {
  try {
    const supabase = createClient();
    const user = await getCachedUser();
    if (!user) return null;
    return await buildHaqState(supabase, user.id);
  } catch (error) {
    console.error('getMyHaq failed', error);
    return null;
  }
});
