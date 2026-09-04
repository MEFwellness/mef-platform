'use client';

/**
 * The trial arc, the invisible "this reached her" tracker.
 *
 * Same shape and same exactly-once discipline as
 * components/weekly-reflection/TrackWeeklyReflectionDelivered.tsx and
 * components/priority/TrackPriorityShown.tsx. Renders nothing, fires after
 * paint, never delays the render the member is waiting on.
 *
 * IT IS THE ONLY THING THAT SAYS A MESSAGE WAS DELIVERED. The arc's closer
 * counts messages that genuinely reached her and that she then did nothing
 * with, so a receipt written anywhere other than a real display would count
 * against a member who was never shown anything. A render must never write
 * one, which is why this is a mounted effect on the pop-up itself.
 *
 * THE CLIENT SIDE DOES NOT DECIDE ONCE PER DAY. The dedupe below only stops
 * one mounted instance double firing across React's development remount.
 * The database decides, with the unique constraint behind
 * claimTrialArcDelivery, and the server re-resolves which message is
 * genuinely hers today before writing anything.
 *
 * A BEACON, NOT A SERVER ACTION, for the reason
 * app/api/analytics/track/route.ts states in full: a Server Action
 * re-renders the whole current route on the server, and this component
 * renders nothing.
 */

import { useEffect, useRef } from 'react';
import { sendBeacon } from '@/lib/analytics/beacon';

const DEDUPE_WINDOW_MS = 3000;
const lastFiredAt = new Map<string, number>();

function shouldFire(key: string): boolean {
  const now = Date.now();
  const previous = lastFiredAt.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;
  lastFiredAt.set(key, now);
  return true;
}

export function TrackTrialArcDelivered({ messageKey }: { messageKey: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (shouldFire(messageKey)) sendBeacon({ event: 'trial_arc_delivered', messageKey });
  }, [messageKey]);

  return null;
}

/**
 * The CTA stamp, fired from the button she actually pressed.
 *
 * `keepalive` is what makes this safe to fire on a link that navigates away
 * in the same gesture: the browser is required to finish the request even
 * after the page unloads, which is exactly the property sendBeacon was
 * written for. A Server Action here would re-render a route she is in the
 * middle of leaving.
 */
export function reportTrialArcCtaTapped(messageKey: string): void {
  sendBeacon({ event: 'trial_arc_cta_tapped', messageKey });
}
