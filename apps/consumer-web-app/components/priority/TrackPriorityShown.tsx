'use client';

/**
 * Priority Card — the invisible "this was shown" tracker.
 *
 * Same shape and same exactly-once discipline as
 * components/analytics/TrackSurfaceView.tsx (a module-level dedupe window
 * plus a ref, because React's development double-effect remount defeats a
 * ref on its own). Renders nothing, fires after paint, never delays the
 * render the member is waiting on.
 *
 * The client-side dedupe window here only stops a single mounted instance
 * double-firing across React's development remount. It is deliberately NOT
 * what enforces "one priority per day": Home renders the pop-up and the
 * inline card in the same pass, so no client-side timer could decide that
 * correctly. The server does it, with an atomic claim against
 * member_daily_priorities.shown_at — see claimPriorityShown.
 *
 * Fires exactly ONE server action per real showing, and that action
 * decides how many events the showing is worth (bug sweep finding B2,
 * 2026-08-27). It used to fire two, and the second one, re_entry_shown,
 * had no server-side claim behind it at all, only the dedupe window
 * below, which expires between page loads. One real re-entry opening
 * therefore wrote a row per mount per load: 42 rows for one member on one
 * day, measured on production.
 *
 * `isReEntry` is now passed through to the same claimed action instead, so
 * every event this showing produces rides the one atomic claim:
 *   priority_shown              which hierarchy rule won, which
 *                               presentation reached her first.
 *   coaching_action_delivered   when a ledger decision exists.
 *   re_entry_shown              when she is in the re-entry state.
 * All three, at most once per member per local day.
 */

import { useEffect, useRef } from 'react';
import { trackPriorityShownAction } from '@/app/actions/priority';
import type { PriorityRule } from '@/lib/priority/types';
import type { PriorityPresentation } from '@/lib/analytics/surfaces';

const DEDUPE_WINDOW_MS = 3000;
const lastFiredAt = new Map<string, number>();

function shouldFire(key: string): boolean {
  const now = Date.now();
  const previous = lastFiredAt.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;
  lastFiredAt.set(key, now);
  return true;
}

export function TrackPriorityShown({
  rule,
  isReEntry,
  presentation,
}: {
  rule: PriorityRule;
  isReEntry: boolean;
  /** Which presentation this instance is. The server decides which one actually wins the day's single event. */
  presentation: PriorityPresentation;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (shouldFire(`priority:${rule}:${presentation}`)) {
      void trackPriorityShownAction(rule, presentation, isReEntry);
    }
  }, [rule, isReEntry, presentation]);

  return null;
}
