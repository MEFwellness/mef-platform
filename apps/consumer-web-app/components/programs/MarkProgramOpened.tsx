'use client';

import { useEffect, useRef } from 'react';
import { markProgramOpenedAction } from '@/app/actions/coach-programs';

/**
 * "She opened her program." Renders nothing.
 *
 * Same shape and the same reasons as
 * components/analytics/TrackSurfaceView.tsx: dropped into a server-rendered
 * screen, fired from a mounted effect so the write happens after the screen
 * has painted and never delays the render she is waiting on, and guarded so
 * React's development-mode double mount cannot fire it twice.
 *
 * Deliberately NOT a render-time write on the page itself. A page render
 * must not insert rows: server actions revalidate their own route, so a
 * render-time insert repeats on every button press on that screen.
 *
 * Writing twice would still be harmless here (recordProgramOpened refuses
 * a program that already carries an open), but the round trip would not be,
 * and the guard costs nothing.
 */
export function MarkProgramOpened({ assignmentId }: { assignmentId: string | null }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!assignmentId || fired.current) return;
    fired.current = true;
    void markProgramOpenedAction(assignmentId);
  }, [assignmentId]);

  return null;
}
