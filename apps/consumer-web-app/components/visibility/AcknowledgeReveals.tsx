'use client';

/**
 * Marks a set of reveal sentences as said. Renders nothing, fires after
 * paint, never delays the render the member is waiting on.
 *
 * Same exactly-once discipline as components/priority/TrackPriorityShown.tsx
 * and components/analytics/TrackSurfaceView.tsx: a module-level dedupe
 * window plus a ref, because React's development double-effect remount
 * defeats a ref on its own. The real "said once" guarantee is the database
 * column (`member_feature_visibility.acknowledged_at`), not this window.
 */

import { useEffect, useRef } from 'react';
import { acknowledgeRevealsAction } from '@/app/actions/visibility';

const DEDUPE_WINDOW_MS = 3000;
const lastFiredAt = new Map<string, number>();

function shouldFire(key: string): boolean {
  const now = Date.now();
  const previous = lastFiredAt.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;
  lastFiredAt.set(key, now);
  return true;
}

export function AcknowledgeReveals({ featureKeys }: { featureKeys: string[] }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || featureKeys.length === 0) return;
    const dedupeKey = featureKeys.join('|');
    if (!shouldFire(dedupeKey)) return;
    fired.current = true;
    void acknowledgeRevealsAction(featureKeys);
  }, [featureKeys]);

  return null;
}
