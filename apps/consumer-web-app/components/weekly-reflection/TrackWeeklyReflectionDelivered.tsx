'use client';

/**
 * The Weekly Reflection, the invisible "this reached her" tracker.
 *
 * Same shape and same exactly-once discipline as
 * components/priority/TrackPriorityShown.tsx and
 * components/weekly-review/TrackWeeklyReviewViewed.tsx. Renders nothing,
 * fires after paint, never delays the render the member is waiting on.
 *
 * IT FIRES FROM BOTH REAL PRESENTATIONS, on purpose. The pop-up gets one
 * showing per login inside her window; the persistent card on Home is the
 * way in for the rest of the weekend. Both are the reflection genuinely
 * reaching her, and a receipt that only counted the pop-up would let a
 * coach's screen say "they have not opened the app since Friday" about a
 * member who opened it, saw the card, and chose not to write. `presentation`
 * records which one got there first.
 *
 * THE CLIENT SIDE DOES NOT DECIDE ONCE PER WEEK. The dedupe window below
 * only stops one mounted instance double-firing across React's development
 * remount. Home can render the pop-up and the card in the same pass, and
 * she can reopen the app the next day, so no client-side timer could ever
 * decide this correctly. The database does, with the unique constraint
 * behind claimReflectionDelivery.
 *
 * A BEACON, NOT A SERVER ACTION, for the reason
 * app/api/analytics/track/route.ts states in full: a Server Action call
 * re-renders the whole current route on the server, and this component
 * renders nothing and is worth nothing to her. A route handler returns 204
 * and re-renders nothing.
 */

import { useEffect, useRef } from 'react';
import { sendBeacon } from '@/lib/analytics/beacon';
import type { ReflectionPresentation } from '@/lib/weekly-reflection/data';

const DEDUPE_WINDOW_MS = 3000;
const lastFiredAt = new Map<string, number>();

function shouldFire(key: string): boolean {
  const now = Date.now();
  const previous = lastFiredAt.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;
  lastFiredAt.set(key, now);
  return true;
}

export function TrackWeeklyReflectionDelivered({
  weekStart,
  presentation,
}: {
  /** Only ever used to key the dedupe window. The server re-resolves the week from her own timezone and never trusts this. */
  weekStart: string;
  presentation: ReflectionPresentation;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (shouldFire(`weekly_reflection:${weekStart}:${presentation}`)) {
      sendBeacon({ event: 'weekly_reflection_delivered', presentation });
    }
  }, [weekStart, presentation]);

  return null;
}
