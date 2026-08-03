'use client';

/**
 * Owns the session-entry rule's *live* half. Mounted once in app/layout.tsx
 * (present on every page), so it never remounts on an internal client-side
 * navigation — which is exactly what makes "never play on internal page
 * navigation" true for free: nothing here re-runs just because a member
 * tapped a nav link.
 *
 * Two ways the animation can start:
 * 1. `initialShouldPlay` — computed entirely server-side (middleware.ts +
 *    app/layout.tsx, see lib/entry-animation/rule.ts), covering a fresh
 *    login and "reopened after being fully closed."
 * 2. The Page Visibility listener below — covers the one case the server
 *    can't see at all: the tab/app stayed open (never made a new request)
 *    but was backgrounded for a meaningful period and has now returned to
 *    the foreground. Tracked in a plain ref, not storage — this component
 *    is already mounted and alive for the whole time the tab is, so there
 *    is nothing to persist across a reload that wouldn't already be
 *    better served by case 1 above.
 *
 * A real subtlety trigger 1 has to account for: this Gate is mounted once
 * in the root layout and *stays mounted* across every client-side
 * navigation for the rest of the browsing session (that's exactly what
 * makes "never replay on internal navigation" free — nothing here
 * remounts just because a member tapped a nav link). But it also means a
 * plain `useState(initialShouldPlay)` lazy initializer is the wrong tool
 * on its own: signIn() (app/actions/auth.ts) now resolves its real
 * destination and redirects there directly — one hop, one request — but a
 * bare '/' visit still goes through app/page.tsx's own further redirect(),
 * a second request that can render this exact already-mounted instance
 * again with *updated* props as the cookie state resolves. useState's
 * initializer only ever runs on the very first mount, so a later render
 * bringing initialShouldPlay from false to true would otherwise be
 * silently ignored. The effect below is what actually reacts to that
 * transition; the useState initializer alone only covers the (still real,
 * and still zero-flash) case of a genuine fresh document load where this
 * is the first render outright.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getEntryAnimationGreeting, consumeEntryAnimationTriggers } from '@/app/actions/entryAnimation';
import { ENTRY_ANIMATION_REOPEN_THRESHOLD_MS, isEntryAnimationExcludedPath } from '@/lib/entry-animation/rule';
import { RootResetEntryAnimation } from './RootResetEntryAnimation';

export function RootResetEntryGate({
  initialShouldPlay,
  initialFirstName,
}: {
  initialShouldPlay: boolean;
  initialFirstName: string | null;
}) {
  const pathname = usePathname();
  const [active, setActive] = useState(initialShouldPlay);
  const [firstName, setFirstName] = useState<string | null | undefined>(
    initialShouldPlay ? initialFirstName : undefined
  );
  const hiddenAtRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Guards against re-triggering on every re-render while initialShouldPlay
  // stays true (React can render the same props more than once for one
  // logical navigation), and against missing a *genuinely new* true after
  // it has gone back to false in between (a later, real fresh trigger).
  // Deliberately always starts false, even when initialShouldPlay is
  // already true on this very first render (the common, fresh-login case)
  // — an earlier version seeded this from initialShouldPlay itself, which
  // made it start out already "true" for that exact case and silently
  // skipped calling consumeEntryAnimationTriggers() below the one time it
  // mattered most, leaving the sticky server cookie uncleared and racing a
  // later navigation into replaying. Effects always run after the first
  // paint regardless of mount vs. update, so starting this false and
  // consuming unconditionally on the first true is correct either way.
  const consumedRef = useRef(false);

  useEffect(() => {
    if (initialShouldPlay && !consumedRef.current) {
      consumedRef.current = true;
      setActive(true);
      setFirstName(initialFirstName);
      // One-shot: clears the sticky server-side cookies middleware.ts set,
      // so the member's next ordinary navigation doesn't see them as still
      // "pending" and replay.
      consumeEntryAnimationTriggers().catch(() => {});
    } else if (!initialShouldPlay) {
      consumedRef.current = false;
    }
  }, [initialShouldPlay, initialFirstName]);

  useEffect(() => {
    // Public/first-run/coach/admin pages never arm the live re-trigger —
    // matches the same exclusion rule the server side uses, so a member
    // idling on e.g. /onboarding never has this fire on them.
    if (isEntryAnimationExcludedPath(pathname ?? '')) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      // visible again
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (activeRef.current) return; // already playing
      if (!hiddenAt) return;
      if (Date.now() - hiddenAt < ENTRY_ANIMATION_REOPEN_THRESHOLD_MS) return;

      setFirstName(undefined);
      getEntryAnimationGreeting()
        .then((result) => {
          if (!result.authenticated) return; // session died while backgrounded — never show "Welcome back"; let the page's own auth check redirect
          setFirstName(result.firstName);
          setActive(true);
        })
        .catch(() => {
          /* network hiccup — silently skip the animation rather than risk trapping the member on a broken splash */
        });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pathname]);

  if (!active) return null;

  return <RootResetEntryAnimation firstName={firstName} onComplete={() => setActive(false)} />;
}
