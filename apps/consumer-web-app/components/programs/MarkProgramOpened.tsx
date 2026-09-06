'use client';

import { useEffect, useRef } from 'react';
import { sendBeacon } from '@/lib/analytics/beacon';

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
 *
 * IT REPORTS THROUGH THE BEACON, NOT THROUGH A SERVER ACTION (performance
 * and stability audit, 2026-09-06). A mounted effect that calls a Server
 * Action does not have the "never delays her screen" property this
 * component was written for: Next POSTs to the route she is standing on and
 * re-renders the whole of it on the server. On production that was a second
 * full render of /programs, roughly eight hundred milliseconds, for the
 * sake of one stamp. `sendBeacon` posts to a route handler that returns 204
 * and re-renders nothing. The server-side write is the same function.
 */
export function MarkProgramOpened({ assignmentId }: { assignmentId: string | null }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!assignmentId || fired.current) return;
    fired.current = true;
    sendBeacon({ event: 'program_opened', assignmentId });
  }, [assignmentId]);

  return null;
}
