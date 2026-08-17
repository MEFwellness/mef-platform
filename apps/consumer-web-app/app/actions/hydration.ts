/**
 * apps/consumer-web-app/app/actions/hydration.ts
 *
 * Conditional water tracking — the application's entry points into
 * profiles.hydration_focus (migration 163).
 *
 * Three ways the flag is ever set, all landing on the same database
 * function so a coach's value and a member's answer can never diverge into
 * two competing stores:
 *
 *   1. The intake question, written by app/actions/onboarding.ts on
 *      submission (source 'intake').
 *   2. Root's one-time pop-up for members who finished intake before the
 *      question existed (source 'member_popup', below).
 *   3. The coach's toggle on the member's coach profile (source 'coach',
 *      below), which overrides either of the above in either direction —
 *      a coach may know a member needs water tracked even though she said
 *      she drinks plenty, and equally may know she does not.
 *
 * Authorization is the database function's job, not this file's:
 * set_member_hydration_focus() raises 42501 for anyone who is neither the
 * member, her active coach, nor a platform administrator. The coach guard
 * here exists so a coach gets a sentence instead of a Postgres error, not
 * because it is the thing standing between a stranger and the write.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { requestCache } from '@/lib/reactRequestCache';
import {
  fetchHydrationFocus,
  isHydrationTracked,
  setHydrationFocus,
  type HydrationFocusState,
} from '@/lib/hydration/data';
import { clearRootPopupDismissal } from '@/lib/root-popup-messages/data';
import { HYDRATION_POPUP_MESSAGE_KEY } from '@/lib/hydration/constants';
import type { ActionResult } from './auth';

/**
 * Whether water should appear for the signed-in member. Request-scoped: the
 * Today page alone asks three times in one render (the water line in
 * Today's Recommendations, the tracker in the day's zones, and the tracker
 * again once it has been logged), and the check-in asks once more.
 */
export const getMyHydrationTracked = requestCache(async (): Promise<boolean> => {
  const user = await getCachedUser();
  if (!user) return true;
  return isHydrationTracked(createClient(), user.id);
});

/** The signed-in member's own raw state, including whether she has ever been asked. Used by Root's pop-up to decide whether there is anything left to ask. */
export async function getMyHydrationFocusState(): Promise<HydrationFocusState> {
  const user = await getCachedUser();
  if (!user) return { focus: null, source: null };
  return fetchHydrationFocus(createClient(), user.id);
}

/**
 * The member answering Root's pop-up. Clears the pop-up's own dismissal row
 * on the way out — the question can never be pending again, so leaving a
 * stale "snoozed" row behind would be dead state (the same courtesy every
 * other answered Root message already does).
 */
export async function setMyHydrationFocusAction(value: boolean): Promise<ActionResult> {
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const supabase = createClient();
  const { error } = await setHydrationFocus(supabase, user.id, value, 'member_popup');
  if (error) return { error };

  await clearRootPopupDismissal(supabase, user.id, HYDRATION_POPUP_MESSAGE_KEY);

  revalidatePath('/today');
  revalidatePath('/dashboard');
  return {};
}

/** A coach's read of one client's state, for the toggle's current position and its "set by" line. */
export async function getClientHydrationFocusState(memberId: string): Promise<HydrationFocusState> {
  const user = await getCachedUser();
  if (!user) return { focus: null, source: null };
  return fetchHydrationFocus(createClient(), memberId);
}

/**
 * The coach's toggle. Overrides the member's own answer in either
 * direction, permanently, until somebody changes it again — the member is
 * never re-asked, because Root's pop-up is only ever due while the flag is
 * still unanswered.
 */
export async function setClientHydrationFocusAction(
  memberId: string,
  value: boolean
): Promise<ActionResult> {
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const supabase = createClient();
  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);
  if (!isCoach && !isAdmin) return { error: 'Coach access required.' };

  const { error } = await setHydrationFocus(supabase, memberId, value, 'coach');
  if (error) return { error };

  revalidatePath(`/coach/clients/${memberId}`);
  return {};
}
