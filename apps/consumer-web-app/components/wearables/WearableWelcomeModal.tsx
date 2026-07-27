'use client';

/**
 * One-time premium welcome modal steering a new member toward connecting
 * a wearable, shown on the Dashboard. Dismissal (either button) is
 * remembered in localStorage — same "client-only, per-browser, never
 * shown again" precedent as MessageInput.tsx's PRIVACY_ACK_KEY — rather
 * than a new profiles column, since this is a one-off UI nudge, not
 * durable account state worth a migration.
 *
 * Only ever rendered by the Dashboard when the server already knows no
 * wearable is connected yet; this component's only job is the "have we
 * already shown it in this browser, and has she had her first glance
 * yet" checks, never the connection check itself.
 *
 * 2026-07-27 UX fix ("wearable-connect modal timing"): this used to
 * become visible immediately on mount — for a returning member, that
 * meant it covered the hero/Daily Brief she came to look at before she'd
 * seen any of it. Chosen mechanism: a scroll-position trigger rather
 * than a flat delay, since "surfaces after that first glance" is a
 * behavioral condition (has she actually looked past the hero and
 * started reading real content), not a fixed amount of time an arbitrary
 * reader may or may not need. Reveals once `window.scrollY` passes 55%
 * of one viewport height — enough to mean she's moved past the hero
 * greeting, not so much that she has to scroll far to trigger it. A
 * 4-second fallback timer covers the member who never scrolls at all
 * (reads the hero, doesn't move) so the pitch still eventually surfaces
 * in the same session rather than silently never showing. Dismissal
 * behavior (localStorage, sticks permanently) and the suppression for a
 * first-time member with no check-ins yet (still handled by
 * app/dashboard/page.tsx's own `hasCheckins` gate around this
 * component, untouched) are both unaffected by this change.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

const DISMISSED_KEY = 'mef_wearable_welcome_dismissed';
const SCROLL_REVEAL_FRACTION = 0.55;
const FALLBACK_DELAY_MS = 4000;

export function WearableWelcomeModal() {
  const [visible, setVisible] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(DISMISSED_KEY)) return;

    function reveal() {
      if (readyRef.current) return;
      readyRef.current = true;
      setVisible(true);
    }

    function onScroll() {
      if (window.scrollY > window.innerHeight * SCROLL_REVEAL_FRACTION) reveal();
    }

    // Already scrolled past the threshold before this effect even ran
    // (e.g. a fast reader, or returning to a page that restored scroll
    // position) — reveal immediately rather than waiting on a future
    // scroll event that may never come.
    onScroll();

    window.addEventListener('scroll', onScroll, { passive: true });
    const fallback = window.setTimeout(reveal, FALLBACK_DELAY_MS);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(fallback);
    };
  }, []);

  useBodyScrollLock(visible);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-[#1B3A2D]/30 backdrop-blur-[2px]"
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wearable-welcome-title"
        className="relative w-full max-w-sm rounded-[28px] bg-white p-7 shadow-[0_24px_64px_-12px_rgba(27,58,45,0.35)]"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F5B700]/15">
          <Sparkles className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h2
          id="wearable-welcome-title"
          className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]"
        >
          Get the Most From Root
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-[#6B7A72]">
          Connect your wearable to unlock personalized recovery insights, adaptive coaching, sleep
          recommendations, and smarter daily guidance.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/connections"
            onClick={dismiss}
            className="flex items-center justify-center rounded-full bg-[#1B3A2D] px-5 py-3 text-sm font-medium text-white transition hover:brightness-110"
          >
            Connect Device
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full px-5 py-3 text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
