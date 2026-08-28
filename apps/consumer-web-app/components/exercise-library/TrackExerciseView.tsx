'use client';

import { useEffect, useRef } from 'react';
import { recordExerciseView } from '@/app/actions/exercise-library';

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
 * double mount. The server action it calls already existed.
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
    void recordExerciseView(externalId, exerciseName);
  }, [externalId, exerciseName]);

  return null;
}
