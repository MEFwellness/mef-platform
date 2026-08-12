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
 * Fires up to two events per real showing:
 *   priority_shown  always, carrying which hierarchy rule won.
 *   re_entry_shown  additionally, when rule 0 fired, so "how often does
 *                   the re-entry override actually happen" is answerable
 *                   directly rather than inferred from a rule slug.
 */

import { useEffect, useRef } from 'react';
import { trackPriorityShownAction, trackReEntryShownAction } from '@/app/actions/priority';
import type { PriorityRule } from '@/lib/priority/types';

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
}: {
  rule: PriorityRule;
  isReEntry: boolean;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (shouldFire(`priority:${rule}`)) {
      void trackPriorityShownAction(rule);
    }
    if (isReEntry && shouldFire('priority:re_entry_shown')) {
      void trackReEntryShownAction();
    }
  }, [rule, isReEntry]);

  return null;
}
