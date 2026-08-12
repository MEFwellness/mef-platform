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
 * Fires up to two events per real showing:
 *   priority_shown  at most once per member per day, carrying which
 *                   hierarchy rule won and which presentation reached her.
 *   re_entry_shown  additionally, when rule 0 fired, so "how often does
 *                   the re-entry override actually happen" is answerable
 *                   directly rather than inferred from a rule slug.
 */

import { useEffect, useRef } from 'react';
import { trackPriorityShownAction, trackReEntryShownAction } from '@/app/actions/priority';
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
      void trackPriorityShownAction(rule, presentation);
    }
    if (isReEntry && shouldFire('priority:re_entry_shown')) {
      void trackReEntryShownAction();
    }
  }, [rule, isReEntry, presentation]);

  return null;
}
