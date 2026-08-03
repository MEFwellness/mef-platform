'use client';

/**
 * Owns the session-entry rule's *live* half. Mounted once in app/layout.tsx
 * (present on every page), so it never remounts on an internal client-side
 * navigation — which is exactly what makes "never play on internal page
 * navigation" true for free: nothing here re-runs just because a member
 * tapped a nav link.
 *
 * Two ways the animation can start:
 * 1. `initialEntryToken` — a one-shot opaque token minted server-side
 *    (middleware.ts, see its own comment for the full rule and the
 *    browser vs. installed/PWA note) whenever a fresh login or a
 *    meaningful reopen is decided. Compared below against the last token
 *    already consumed (sessionStorage, never sent over the network) — the
 *    server can safely resend the *same* token on a later request (an
 *    ordinary reload, a multi-hop redirect) without risking a replay,
 *    since the client only ever acts on a token value it hasn't already
 *    seen. This replaced an earlier design that tried to have the client
 *    explicitly clear a boolean cookie after playing, which reliably lost
 *    a race against Next.js's own automatic <Link> prefetching (confirmed
 *    directly against production) — a token compared client-side has no
 *    equivalent race, since it doesn't matter how many extra requests
 *    resend the same value.
 * 2. The Page Visibility listener below — covers the one case the server
 *    can't see at all: the tab/app stayed open (never made a new request)
 *    but was backgrounded for a meaningful period and has now returned to
 *    the foreground. Tracked in a plain ref, not storage — this component
 *    is already mounted and alive for the whole time the tab is, so there
 *    is nothing to persist across a reload that wouldn't already be
 *    better served by case 1 above.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ENTRY_ANIMATION_REOPEN_THRESHOLD_MS, isEntryAnimationExcludedPath } from '@/lib/entry-animation/rule';
import { RootResetEntryAnimation } from './RootResetEntryAnimation';

interface EntryAnimationGreeting {
  authenticated: boolean;
  firstName: string | null;
}

function getEntryAnimationGreeting(): Promise<EntryAnimationGreeting> {
  return fetch('/api/entry-animation/greeting').then((res) => res.json());
}

/** sessionStorage, not localStorage: deliberately tab-scoped, so a genuinely new tab (or a relaunched, previously-killed PWA) always starts with no consumed-token history — that's what makes "closed and reopened" naturally distinct from "reloaded the same tab." */
const ENTRY_TOKEN_STORAGE_KEY = 'mef-entry-consumed-token';

export function RootResetEntryGate({
  initialEntryToken,
  initialFirstName,
}: {
  initialEntryToken: string | null;
  initialFirstName: string | null;
}) {
  const pathname = usePathname();
  // SSR-matched initial guess: correct and zero-flash for the dominant
  // case (a token that's definitely never been consumed, since it was
  // just minted). The rare case this can get wrong — a hard reload within
  // the token's own short reuse window, sessionStorage already has it —
  // self-corrects one effect tick later (below), since sessionStorage
  // itself is never available during the server render this initial
  // value has to match.
  const [active, setActive] = useState(initialEntryToken !== null);
  const [firstName, setFirstName] = useState<string | null | undefined>(
    initialEntryToken !== null ? initialFirstName : undefined
  );
  const hiddenAtRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // The last token value this component instance has already resolved
  // (played-or-skipped), so a re-render carrying the *same* token (e.g.
  // only initialFirstName changed) doesn't redo the sessionStorage dance.
  const resolvedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialEntryToken === null || initialEntryToken === resolvedTokenRef.current) return;
    resolvedTokenRef.current = initialEntryToken;

    let storedToken: string | null = null;
    try {
      storedToken = sessionStorage.getItem(ENTRY_TOKEN_STORAGE_KEY);
    } catch {
      // Inaccessible (rare private-browsing edge cases) — treat as never
      // consumed; worst case is one extra play, not a crash or a stuck gate.
    }

    if (storedToken === initialEntryToken) {
      setActive(false); // corrects the SSR-matched guess above for the reload-within-window case
      return;
    }

    try {
      sessionStorage.setItem(ENTRY_TOKEN_STORAGE_KEY, initialEntryToken);
    } catch {
      // Best-effort — if this write fails, the worst case is a possible
      // replay on the very next reload, not a crash.
    }
    setActive(true);
    setFirstName(initialFirstName);
  }, [initialEntryToken, initialFirstName]);

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
