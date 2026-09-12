/**
 * The server side accessor for this member's Health & Lifestyle Intake
 * state, and for the one thing the first screen prefills from.
 *
 * Deliberately NOT in app/actions/healthIntake.ts, for the same two reasons
 * lib/whole-body-signal/view.ts is not in its action file: a 'use server'
 * module may only export async functions, and these are request memoized
 * consts, and a client component must never be able to call them.
 *
 * Never throws. Any failure resolves to "not offered", which is the same
 * fail shut direction lib/health-intake/access.ts takes.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { buildHliState, type HliState } from './service';

export const getMyHealthIntake = requestCache(async (): Promise<HliState | null> => {
  try {
    const supabase = createClient();
    const user = await getCachedUser();
    if (!user) return null;
    return await buildHliState(supabase, user.id);
  } catch (error) {
    console.error('getMyHealthIntake failed', error);
    return null;
  }
});

/**
 * What the first screen can honestly prefill.
 *
 * ONE FIELD, AND THAT IS NOT AN OVERSIGHT. Her display name is the only
 * thing this app already knows that section one asks for. There is no date
 * of birth, occupation or height stored anywhere in the schema today, on
 * profiles, in member_health_profiles or in onboarding_submissions, so
 * there is nothing to prefill them from and inventing one would be exactly
 * the fake default the standing rules forbid.
 *
 * HER WELCOME FLOW GOALS ARE DELIBERATELY NOT PREFILLED INTO SECTION TWO.
 * They are answers to a different question, asked at a different time, in a
 * different vocabulary, and pre-ticking a multi-select from them would
 * write answers she never gave the moment she pressed Continue.
 */
export const getHealthIntakePrefill = requestCache(
  async (): Promise<{ displayName: string }> => {
    try {
      const supabase = createClient();
      const user = await getCachedUser();
      if (!user) return { displayName: '' };
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      const name = (data as { display_name: string | null } | null)?.display_name ?? '';
      return { displayName: name ?? '' };
    } catch (error) {
      console.error('getHealthIntakePrefill failed', error);
      return { displayName: '' };
    }
  }
);
