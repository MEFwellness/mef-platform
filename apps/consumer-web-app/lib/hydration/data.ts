/**
 * Conditional water tracking — database access. Pure functions taking a
 * SupabaseClient, RLS decides who may read what, same shape as every other
 * data.ts in this codebase.
 *
 * Most water surfaces never call anything here: they read
 * `hydration_tracked` off the daily_checkins_current row they already
 * fetched (migration 163 attaches it to every row). These exist for the
 * surfaces that have no check-in row in hand — the Today page before a
 * check-in exists, Root's pop-up, the coach's toggle, the check-in plan.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type HydrationFocusSource = 'intake' | 'member_popup' | 'coach';

export type HydrationFocusState = {
  /** null means she has never been asked. Not the same as false — see lib/hydration/constants.ts. */
  focus: boolean | null;
  source: HydrationFocusSource | null;
};

export async function fetchHydrationFocus(
  supabase: SupabaseClient,
  memberId: string
): Promise<HydrationFocusState> {
  const { data, error } = await supabase
    .from('profiles')
    .select('hydration_focus, hydration_focus_source')
    .eq('id', memberId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('fetchHydrationFocus failed', error);
    // Unreadable is treated exactly like unanswered: behave as the app
    // always has rather than silently hiding a member's water.
    return { focus: null, source: null };
  }

  return {
    focus: (data.hydration_focus as boolean | null) ?? null,
    source: (data.hydration_focus_source as HydrationFocusSource | null) ?? null,
  };
}

/**
 * The question every water surface actually asks. Unanswered resolves to
 * true, matching member_hydration_tracked() in the database exactly — the
 * two must never disagree, or a member could see a tracker the scoring
 * layer is ignoring.
 */
export async function isHydrationTracked(
  supabase: SupabaseClient,
  memberId: string
): Promise<boolean> {
  const { focus } = await fetchHydrationFocus(supabase, memberId);
  return focus !== false;
}

/**
 * The only write path. Goes through set_member_hydration_focus() (migration
 * 163) rather than updating profiles directly, because a coach setting this
 * for a client has no RLS update policy on that row and must not be given
 * one — the whole of profiles would come with it.
 */
export async function setHydrationFocus(
  supabase: SupabaseClient,
  memberId: string,
  value: boolean,
  source: HydrationFocusSource
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_member_hydration_focus', {
    p_member: memberId,
    p_value: value,
    p_source: source,
  });

  if (error) {
    console.error('setHydrationFocus failed', error);
    return { error: 'Could not save that. Please try again.' };
  }
  return { error: null };
}
