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
import { ChevronLeft } from 'lucide-react';

export function BackButton({ fallbackHref, label }: { fallbackHref: Route; label: string }) {
  const router = useRouter();

  function handleClick() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
    >
      <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  );
}
