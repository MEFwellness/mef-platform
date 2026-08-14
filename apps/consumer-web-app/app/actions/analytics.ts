/**
 * apps/consumer-web-app/app/actions/analytics.ts
 *
 * The server actions client components call to record behavioral events.
 * Everything here goes through lib/analytics/track.ts, which goes through
 * lib/events/service.ts's recordMemberEvent, the one write path into
 * member_wellness_events. No second pipeline.
 *
 * Why these are actions rather than tracking inside the page's own server
 * render: a page render is exactly the thing the member is waiting on, and
 * an insert on that path would slow every screen. These fire from a mounted
 * client component instead (components/analytics/TrackSurfaceView.tsx),
 * after the screen has already painted, so tracking is genuinely off the
 * critical path.
 *
 * Every action here:
 *   - validates its input against the closed allowlists in
 *     lib/analytics/surfaces.ts, because the values arrive from the
 *     browser and must never be able to carry health content;
 *   - returns void and never throws, so a caller can `void`-call it and a
 *     failure can never break a screen;
 *   - resolves the member's own stored profile timezone server-side, never
 *     a client-supplied one, same discipline as app/actions/events.ts.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trackProductEvent } from '@/lib/analytics/track';
import { hasActiveRole } from '@/lib/auth/guards';
import { shouldRecordMemberAnalytics } from '@/lib/auth/staffRouting';
import {
  isProductSurface,
  isEngageableFeature,
  isEngagementAction,
  isPaywallLockReason,
  isPaywallFeature,
} from '@/lib/analytics/surfaces';

/**
 * Resolves the caller as a member, or refuses.
 *
 * Two reasons this can return null, and both are ordinary rather than an
 * error. There is no signed-in user at all (a locked marker on a public
 * preview screen). Or the account holds an active coach or administrator
 * grant, in which case it is staff and nothing it does is member
 * behavior: recording it would put staff activity into the very
 * member_wellness_events stream the funnel, retention and drop-off
 * reports read, inflating exactly the numbers those reports exist to
 * answer.
 *
 * Role-based home routing (lib/auth/staffRouting.ts) already stops staff
 * reaching the screens that fire these events. This is the second line,
 * at the write itself, so no future entry point can reintroduce staff
 * events by accident. hasActiveRole() fails closed to false, so a broken
 * role lookup records the event as a member's, which is the safe way
 * round: analytics keeps a real member's data rather than silently
 * dropping it.
 */
async function memberContext(
  supabase: SupabaseClient
): Promise<{ memberId: string; timezone: string } | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const [{ data: profile }, isCoach, isAdmin] = await Promise.all([
    supabase.from('profiles').select('timezone').eq('id', user.id).single(),
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);

  if (!shouldRecordMemberAnalytics({ isCoach, isAdmin })) return null;

  return { memberId: user.id, timezone: profile?.timezone ?? 'America/New_York' };
}

/** Guest/unauthenticated callers are a normal case (a locked marker on a public preview screen), not an error: no member id means no event, silently. */
export async function trackSurfaceViewAction(surface: string): Promise<void> {
  try {
    if (!isProductSurface(surface)) return;
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return;
    await trackProductEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'surface_viewed',
      timezone: ctx.timezone,
      payload: { surface },
    });
  } catch (error) {
    console.error('trackSurfaceViewAction failed', error);
  }
}

export async function trackFeatureEngagementAction(input: {
  feature: string;
  action: string;
}): Promise<void> {
  try {
    if (!isEngageableFeature(input.feature)) return;
    if (!isEngagementAction(input.action)) return;
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return;
    await trackProductEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'feature_engaged',
      timezone: ctx.timezone,
      payload: { feature: input.feature, action: input.action },
    });
  } catch (error) {
    console.error('trackFeatureEngagementAction failed', error);
  }
}

/**
 * A locked or premium marker was actually shown to this member, with the
 * feature that triggered it. Fired when the marker becomes visible (a
 * locked card mounting) or when its explanation is revealed (a tap on a
 * coach-assign-only card), never merely because the member's tier would
 * hypothetically block something.
 */
export async function trackPaywallViewAction(input: {
  feature: string;
  lockReason: string;
}): Promise<void> {
  try {
    if (!isPaywallFeature(input.feature)) return;
    if (!isPaywallLockReason(input.lockReason)) return;
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return;
    await trackProductEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'paywall_viewed',
      timezone: ctx.timezone,
      payload: { feature: input.feature, lockReason: input.lockReason },
    });
  } catch (error) {
    console.error('trackPaywallViewAction failed', error);
  }
}

/**
 * The member reached the first screen of the onboarding flow. Paired with
 * the onboarding_completed event submitOnboarding writes, this is what
 * makes onboarding drop-off measurable: started minus completed.
 */
export async function trackOnboardingStartedAction(): Promise<void> {
  try {
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return;
    await trackProductEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'onboarding_started',
      timezone: ctx.timezone,
    });
  } catch (error) {
    console.error('trackOnboardingStartedAction failed', error);
  }
}

/**
 * The member opened the Daily Reset wizard and it rendered its first
 * screen. Paired with daily_reset_completed (written server-side by
 * submitDailyCheckin), this is what makes check-in abandonment visible.
 */
export async function trackDailyResetStartedAction(): Promise<void> {
  try {
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return;
    await trackProductEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'daily_reset_started',
      timezone: ctx.timezone,
    });
  } catch (error) {
    console.error('trackDailyResetStartedAction failed', error);
  }
}
