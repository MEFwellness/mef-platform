'use client';

/**
 * The Weekly Root Review — the invisible "this reached her" tracker.
 *
 * Same shape and same exactly-once discipline as
 * components/priority/TrackPriorityShown.tsx. Renders nothing, fires after
 * paint, never delays the render the member is waiting on.
 *
 * The client-side dedupe window here only stops a single mounted instance
 * double-firing across React's development remount. It is deliberately NOT
 * what enforces "one viewed event per week": Home can render the pop-up and
 * the persistent entry in the same pass, so no client-side timer could
 * decide that correctly. The server does it, with an atomic claim against
 * member_weekly_reviews.viewed_at (claimWeeklyReviewViewed).
 */

import { useEffect, useRef } from 'react';
import { trackWeeklyReviewViewedAction } from '@/app/actions/weeklyReview';

const DEDUPE_WINDOW_MS = 3000;
const lastFiredAt = new Map<string, number>();

function shouldFire(key: string): boolean {
  const now = Date.now();
  const previous = lastFiredAt.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;
  lastFiredAt.set(key, now);
  return true;
}

export function TrackWeeklyReviewViewed({ weekStart }: { weekStart: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (shouldFire(`weekly_review:${weekStart}`)) {
      void trackWeeklyReviewViewedAction();
    }
  }, [weekStart]);

  return null;
}
