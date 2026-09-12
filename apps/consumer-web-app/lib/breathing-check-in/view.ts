/**
 * The server side accessor for this member's Breathing Pattern Check-In
 * state.
 *
 * Deliberately NOT in app/actions/breathingCheckIn.ts, for the same two
 * reasons lib/whole-body-signal/view.ts is not in its action file: a
 * 'use server' module may only export async functions, and this is a
 * request memoized const, and a client component must never be able to
 * call it.
 *
 * Never throws. Any failure resolves to "not offered", which is the same
 * fail shut direction ./access.ts takes.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildBpcState, type BpcState } from './service';

export const getMyBreathingCheckIn = requestCache(async (): Promise<BpcState | null> => {
  try {
    const supabase = createClient();
    const user = await getCachedUser();
    if (!user) return null;
    return await buildBpcState(supabase, user.id);
  } catch (error) {
    console.error('getMyBreathingCheckIn failed', error);
    return null;
  }
});
