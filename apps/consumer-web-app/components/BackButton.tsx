'use client';

/**
 * Premium Dashboard Experience milestone — the one back control every
 * drill-down/detail screen uses (top-level tabs render none at all, per
 * the same milestone's back-navigation rules). Replaces the several
 * near-identical `<Link href="/parent"><ChevronLeft />Back to X</Link>`
 * blocks that already existed on pages like root-score and profile/baseline
 * with a single component that actually goes back to wherever the member
 * came from (`router.back()`), only falling back to a fixed href when
 * there's no in-app history to return to (e.g. the page was opened
 * directly, a fresh tab, or a deep link) — `window.history.length > 1` is
 * the standard cheap signal for "there is somewhere to go back to."
 */

import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { BackControl } from './BackControl';

type Props = {
  fallbackHref: Route;
  label: string;
  /**
   * Skips the `router.back()` branch entirely and always navigates to
   * `fallbackHref` — for the handful of call sites where "back" has one
   * correct, fixed destination regardless of how the member arrived
   * (e.g. an assessment's results page: in-app history from the take
   * flow always exists by the time a member is looking at results, so
   * the default smart-back would silently reopen the questionnaire
   * instead of returning to the overview). Defaults to false, preserving
   * the smart "go back to wherever you came from" behavior everywhere
   * else that already relies on it.
   */
  forceFallback?: boolean;
};

export function BackButton({ fallbackHref, label, forceFallback = false }: Props) {
  const router = useRouter();

  function handleClick() {
    if (!forceFallback && typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  // The look lives in BackControl so a multi-screen experience stepping
  // backward through its own state gets the identical control without
  // reimplementing it. Only the tap differs.
  return <BackControl onClick={handleClick} label={label} />;
}
