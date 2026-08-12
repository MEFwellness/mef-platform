'use client';

import { useEffect, useRef } from 'react';
import {
  trackSurfaceViewAction,
  trackPaywallViewAction,
  trackDailyResetStartedAction,
  trackOnboardingStartedAction,
} from '@/app/actions/analytics';
import type { ProductSurface } from '@/lib/analytics/surfaces';

/**
 * Product Analytics, the invisible page-view tracker.
 *
 * Renders nothing. Drop `<TrackSurfaceView surface="home" />` into a
 * server-rendered page and that page records one `surface_viewed` event
 * per real visit, fired from a mounted effect so the write happens after
 * the screen has painted and never delays the render the member is waiting
 * on. Zero member-facing change: no markup, no layout, no styling.
 *
 * Exactly-once discipline. Two things would otherwise double-count:
 *   - React's development-mode double effect invocation (StrictMode
 *     mounts, unmounts, remounts every component once). A ref alone does
 *     not survive that remount, so the guard is module level.
 *   - Any re-render or client-router re-mount of the same screen within a
 *     moment of itself.
 * A short dedupe window keyed by surface handles both, while still letting
 * a genuine revisit later in the session record a second, real view.
 */
const DEDUPE_WINDOW_MS = 3000;

const lastFiredAt = new Map<string, number>();

function shouldFire(key: string): boolean {
  const now = Date.now();
  const previous = lastFiredAt.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;
  lastFiredAt.set(key, now);
  return true;
}

export function TrackSurfaceView({ surface }: { surface: ProductSurface }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!shouldFire(`surface:${surface}`)) return;
    void trackSurfaceViewAction(surface);
  }, [surface]);

  return null;
}

/**
 * The same pattern for a locked or premium marker: the member actually saw
 * this locked card, and here is which feature it was gating. Mounted only
 * where a locked treatment genuinely renders, so an event means a marker
 * was on screen, not that the member's tier would hypothetically block
 * something somewhere.
 */
/**
 * "The member reached the first screen of the Daily Reset wizard." Paired
 * with the daily_reset_completed event submitDailyCheckin writes
 * server-side, this is the pair that makes check-in abandonment
 * measurable: started minus completed, per day.
 */
export function TrackDailyResetStarted() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!shouldFire('flow:daily_reset_started')) return;
    void trackDailyResetStartedAction();
  }, []);

  return null;
}

/** Same pair for onboarding: started here, completed in submitOnboarding, drop-off is the difference. */
export function TrackOnboardingStarted() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!shouldFire('flow:onboarding_started')) return;
    void trackOnboardingStartedAction();
  }, []);

  return null;
}

export function TrackPaywallView({
  feature,
  lockReason,
}: {
  feature: string;
  lockReason: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!shouldFire(`paywall:${feature}:${lockReason}`)) return;
    void trackPaywallViewAction({ feature, lockReason });
  }, [feature, lockReason]);

  return null;
}
