'use client';

import { useEffect, useRef } from 'react';
import { sendBeacon } from '@/lib/analytics/beacon';

/**
 * "This exercise was opened." Renders nothing.
 *
 * L3 (the 2026-08-27 sweep). `/exercises/[id]` used to call
 * `recordExerciseView` from inside its own server render, as a
 * fire-and-forget promise. The sweep filed it as harmless because the row
 * is keyed `(member, provider, external_id)` and so can never duplicate,
 * which is true and is not the whole problem: a server render is not the
 * same event as a person opening a screen. Next prefetches a `<Link>` when
 * it enters the viewport, and a prefetch runs the server render, so
 * scrolling the Exercise Library past a card was enough to file that
 * exercise under "recently viewed" without anybody ever opening it. The
 * list is small and the wrong entry pushes a real one off it.
 *
 * Same shape and the same reasons as
 * components/programs/MarkProgramOpened.tsx and
 * components/analytics/TrackSurfaceView.tsx: fired from a mounted effect,
 * so the write happens after the screen has painted and only when the
 * screen is actually shown, and guarded against React's development-mode
 * double mount.
 *
 * IT REPORTS THROUGH THE BEACON (performance and stability audit,
 * 2026-09-06). It used to call the Server Action directly, which POSTs to
 * the route she is standing on and re-renders the whole of it on the
 * server — the exact cost this component's own "never delays her screen"
 * shape exists to avoid. `sendBeacon` posts to a route handler that returns
 * 204 and re-renders nothing, and calls the very same server-side function.
 */
export function TrackExerciseView({
  externalId,
  exerciseName,
}: {
  externalId: string;
  exerciseName: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (!externalId || fired.current) return;
    fired.current = true;
    sendBeacon({ event: 'exercise_viewed', externalId, exerciseName });
  }, [externalId, exerciseName]);

  return null;
}
