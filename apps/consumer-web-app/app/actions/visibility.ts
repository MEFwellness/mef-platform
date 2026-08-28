'use server';

/**
 * Server actions for the Visibility Layer.
 *
 * Three of them, and no more: read what she can see, mark the reveal
 * sentences as said, and let a coach override. There is deliberately no
 * action that reveals something for a rule reason, because rules are
 * evaluated by lib/visibility/service.ts on every read and a second way in
 * would be a second answer.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import {
  acknowledgeReveals,
  buildMemberVisibility,
  getMemberVisibility,
  hideFeatureAsMember,
  setFeatureVisibilityAsCoach,
} from '@/lib/visibility';
import type { FeatureVisibility, VisibilityState } from '@/lib/visibility/types';
import { todaysLocalDate } from '@/lib/time/localDate';
import { memberTimezone } from '@/lib/time/memberToday';

/** Everything she can see, with the reasons. Request-memoized underneath. */
export async function getMyVisibilityAction(): Promise<FeatureVisibility[]> {
  const visibility = await getMemberVisibility();
  return visibility.features;
}

/**
 * She has now read the plain sentences. Called by the notice component the
 * first time it renders on her screen, so each one is said once rather than
 * every morning.
 */
export async function acknowledgeRevealsAction(featureKeys: string[]): Promise<void> {
  const user = await getCachedUser();
  if (!user) return;
  await acknowledgeReveals(createClient(), user.id, featureKeys);
}

/** She turned something off for herself. */
export async function hideFeatureForMyselfAction(
  featureKey: string
): Promise<{ error: string | null }> {
  const user = await getCachedUser();
  if (!user) return { error: 'Sign in required.' };
  return hideFeatureAsMember(createClient(), user.id, featureKey);
}

/**
 * A coach's override. The database function checks the caller is this
 * member's active coach or a platform administrator, so this handler's own
 * role check is a fast refusal rather than the security boundary.
 */
export async function setMemberFeatureVisibilityAction(
  memberId: string,
  featureKey: string,
  state: VisibilityState,
  reason: string | null
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Sign in required.' };

  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);
  if (!isCoach && !isAdmin) return { error: 'Not allowed.' };

  return setFeatureVisibilityAsCoach(supabase, memberId, featureKey, state, reason);
}

/** What a coach sees on the visibility screen: every feature, its answer, and why. */
export async function getMemberVisibilityForCoachAction(
  memberId: string
): Promise<FeatureVisibility[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];

  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);
  if (!isCoach && !isAdmin) return [];

  const localDate = todaysLocalDate(
    await memberTimezone(supabase, memberId)
  );

  const { visibility } = await buildMemberVisibility(supabase, memberId, localDate, {
    coachView: true,
  });
  return visibility.features;
}
