'use client';

/**
 * A coach assignment, the invisible "this reached her" tracker.
 *
 * Same shape and same exactly-once discipline as
 * components/weekly-reflection/TrackWeeklyReflectionDelivered.tsx, which is
 * the proven one this is lifted from. Renders nothing, fires after paint,
 * never delays the render the member is waiting on.
 *
 * IT FIRES FROM BOTH REAL PRESENTATIONS, on purpose. The Root pop-up gets
 * one showing per login. The persistent card on Home is the way in for
 * every day after that, for as long as the assignment is open. Both are
 * the assignment genuinely reaching her, and a receipt that only counted
 * the pop-up would let a coach's screen say "they have not seen it" about
 * a member who has looked at the card every morning and not sat down to
 * it. `presentation` records which one got there first.
 *
 * A DISPLAY, NOT A PAGE REQUEST. Every surface that mounts this is one
 * that has already decided to draw the assignment for her: the pop-up
 * chain picked it as due, or Home rendered its card. Merely loading a
 * screen writes nothing, and a prefetch renders no card, so nothing here
 * fires for a screen nobody opened.
 *
 * THE CLIENT SIDE DOES NOT DECIDE ONCE PER ASSIGNMENT. The dedupe window
 * below only stops one mounted instance double-firing across React's
 * development remount. Home can render the pop-up and the card in the same
 * pass, and she can reopen the app tomorrow, so no client-side timer could
 * ever decide this correctly. The database does, with the unique
 * constraint behind claimAssignmentDelivery.
 *
 * A BEACON, NOT A SERVER ACTION, for the reason
 * app/api/analytics/track/route.ts states in full: a Server Action call
 * re-renders the whole current route on the server, and this component
 * renders nothing and is worth nothing to her. A route handler returns 204
 * and re-renders nothing.
 */

import { useEffect, useRef } from 'react';
import { sendBeacon } from '@/lib/analytics/beacon';
import type { AssignmentPresentation } from '@/lib/assignments/data';

const DEDUPE_WINDOW_MS = 3000;
const lastFiredAt = new Map<string, number>();

function shouldFire(key: string): boolean {
  const now = Date.now();
  const previous = lastFiredAt.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;
  lastFiredAt.set(key, now);
  return true;
}

export function TrackAssignmentDelivered({
  assignmentId,
  presentation,
}: {
  /** The assessment_assignments row this surface is drawing. The server re-checks that it is hers and still open before it writes anything. */
  assignmentId: string;
  presentation: AssignmentPresentation;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (shouldFire(`assignment:${assignmentId}:${presentation}`)) {
      sendBeacon({ event: 'assignment_delivered', assignmentId, presentation });
    }
  }, [assignmentId, presentation]);

  return null;
}
