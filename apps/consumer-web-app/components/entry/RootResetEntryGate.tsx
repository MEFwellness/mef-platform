'use client';

/**
 * Owns the session-entry rule's *live* half. Mounted once in app/layout.tsx
 * (present on every page), so it never remounts on an internal client-side
 * navigation — which is exactly what makes "never play on internal page
 * navigation" true for free: nothing here re-runs just because a member
 * tapped a nav link.
 *
 * Two ways the animation can start:
 * 1. `initialEntryToken` (from app/layout.tsx's SSR render) — a one-shot
 *    opaque token minted server-side whenever a fresh login or a
 *    meaningful reopen is decided (middleware.ts / app/actions/auth.ts's
 *    signIn(), see their own comments for the full rule and the browser
 *    vs. installed/PWA note). Cross-checked on mount against
 *    document.cookie directly (readEntryToken below), not trusted alone:
 *    confirmed directly against production that app/layout.tsx's own
 *    server render is inconsistent about seeing the just-set cookie for
 *    this exact redirect (Next.js appears to render the root layout more
 *    than once for one Server-Action-triggered redirect, and only one of
 *    those renders reliably carries it) — reading the cookie directly
 *    client-side, where the browser's actual cookie jar is authoritative,
 *    sidesteps that ambiguity entirely. Both mef_entry_login and
 *    mef_entry_play are deliberately not httpOnly for exactly this
 *    reason (a random token, never anything sensitive). Whichever
 *    resolution is used, it's compared against the last token already
 *    consumed (sessionStorage, never sent over the network) and only
 *    plays when they differ.
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
import { RESET_ENTRY_BRIDGE_MAX_MS } from '@/lib/entry-animation/timing';
import { PageSkeleton } from '@/components/PageSkeleton';
import { RootResetEntryAnimation } from './RootResetEntryAnimation';

interface EntryAnimationGreeting {
  authenticated: boolean;
  firstName: string | null;
}

function getEntryAnimationGreeting(): Promise<EntryAnimationGreeting> {
  return fetch('/api/entry-animation/greeting').then((res) => res.json());
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null;
}

/** Mirrors the priority app/layout.tsx's own server-side resolution uses: a fresh login wins over a gap-triggered reopen. */
function readEntryTokenFromCookies(): string | null {
  return readCookie('mef_entry_login') || readCookie('mef_entry_play') || null;
}

/** sessionStorage, not localStorage: deliberately tab-scoped, so a genuinely new tab (or a relaunched, previously-killed PWA) always starts with no consumed-token history — that's what makes "closed and reopened" naturally distinct from "reloaded the same tab." */
const ENTRY_TOKEN_STORAGE_KEY = 'mef-entry-consumed-token';

export function RootResetEntryGate({ initialEntryToken }: { initialEntryToken: string | null }) {
  const pathname = usePathname();
  // SSR-matched initial guess: correct and zero-flash for the dominant
  // case. Corrected one effect tick later (below) if document.cookie
  // disagrees, and self-corrects for the reload-within-window case too,
  // since sessionStorage itself is never available during the server
  // render this initial value has to match.
  const [active, setActive] = useState(initialEntryToken !== null);
  const [firstName, setFirstName] = useState<string | null | undefined>(undefined);
  // Once the branded animation's own fixed duration ends, whether it's
  // safe to reveal whatever is mounted underneath depends on whether a
  // client-side navigation to a *different*, not-yet-rendered page is
  // still in flight — see handleIntroComplete below. True only when the
  // token driving this activation was discovered *after* this component's
  // own SSR render (i.e. arrived via a live client-side redirect this
  // page didn't already know about); false for a token the SSR render
  // already had (nothing left pending — see resolve()) and for the
  // Page Visibility reopen case (the member never left the page at all).
  const [bridging, setBridging] = useState(false);
  const navigationPendingRef = useRef(false);
  const introStartPathRef = useRef<string | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // The last token value this component instance has already resolved
  // (played-or-skipped), so a re-render carrying the *same* token doesn't
  // redo the sessionStorage dance.
  const resolvedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const resolve = (token: string) => {
      if (token === resolvedTokenRef.current) return;
      resolvedTokenRef.current = token;

      let storedToken: string | null = null;
      try {
        storedToken = sessionStorage.getItem(ENTRY_TOKEN_STORAGE_KEY);
      } catch {
        // Inaccessible (rare private-browsing edge cases) — treat as never
        // consumed; worst case is one extra play, not a crash or a stuck gate.
      }

      if (storedToken === token) {
        setActive(false); // corrects the SSR-matched guess above for the reload-within-window case
        return;
      }

      try {
        sessionStorage.setItem(ENTRY_TOKEN_STORAGE_KEY, token);
      } catch {
        // Best-effort — if this write fails, the worst case is a possible
        // replay on the very next reload, not a crash.
      }

      // A token this component's own SSR render already knew about means
      // the destination page had already fully resolved server-side
      // before any client JS ran (a full page load) — there is no
      // pending navigation left to wait for. A token discovered only
      // here means a real client-side navigation (a fresh login's Server
      // Action redirect, or a reopen mid-navigation) is still in flight
      // underneath this overlay, on the *previous* page — see
      // handleIntroComplete for why that distinction matters.
      navigationPendingRef.current = token !== initialEntryToken;
      introStartPathRef.current = pathname;

      setActive(true);
      setFirstName(undefined);
      getEntryAnimationGreeting()
        .then((result) => setFirstName(result.authenticated ? result.firstName : null))
        .catch(() => setFirstName(null));
    };

    // The authoritative source is the browser's actual cookie jar, not the
    // SSR prop alone — see this component's own header comment for why.
    // Retried a few times at short, increasing delays rather than checked
    // just once: confirmed directly against production that this can be
    // genuinely intermittent — a real login sometimes has no token visible
    // via either the SSR prop or an immediate document.cookie read on the
    // very first effect tick, then does on a check moments later. A few
    // hundred milliseconds of retrying is invisible against the ~3.6s
    // animation it's deciding whether to start.
    let cancelled = false;
    const attempt = (retriesLeft: number) => {
      if (cancelled) return;
      const token = readEntryTokenFromCookies() ?? initialEntryToken;
      if (token !== null) {
        resolve(token);
        return;
      }
      if (retriesLeft <= 0) return;
      setTimeout(() => attempt(retriesLeft - 1), 150);
    };
    attempt(5);

    return () => {
      cancelled = true;
    };
  }, [initialEntryToken, pathname]);

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
          // The member never left this page — its content is already
          // loaded and current, so there is nothing for a bridge to wait
          // for once the animation ends.
          navigationPendingRef.current = false;
          setActive(true);
        })
        .catch(() => {
          /* network hiccup — silently skip the animation rather than risk trapping the member on a broken splash */
        });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pathname]);

  // Bridge safety cap: independent of the branded animation's own
  // safe-timeout (that one guarantees the *animation* ends; this one
  // guarantees the *bridge* ends too, so a navigation that never
  // completes can't trap the member behind the skeleton either).
  useEffect(() => {
    if (!bridging) return;
    const cap = setTimeout(() => {
      setBridging(false);
      setActive(false);
    }, RESET_ENTRY_BRIDGE_MAX_MS);
    return () => clearTimeout(cap);
  }, [bridging]);

  // Ends the bridge the moment the pending navigation actually lands —
  // usePathname() only changes once the router has committed the new
  // route, so this fires as early as it possibly can.
  useEffect(() => {
    if (!bridging) return;
    if (pathname !== introStartPathRef.current) {
      setBridging(false);
      setActive(false);
    }
  }, [pathname, bridging]);

  const handleIntroComplete = () => {
    if (navigationPendingRef.current && pathname === introStartPathRef.current) {
      // The branded animation's own fixed duration is over, but the page
      // it's handing off to hasn't arrived yet — never reveal the stale
      // previous screen. Bridges with the app's own loading treatment
      // instead until the real navigation lands (or the cap above gives up).
      setBridging(true);
    } else {
      setActive(false);
    }
  };

  if (!active) return null;

  if (bridging) {
    return (
      <div className="fixed inset-0 z-[999] overflow-y-auto bg-[#FAFAF8]">
        <PageSkeleton message="Just a moment." />
      </div>
    );
  }

  return <RootResetEntryAnimation firstName={firstName} onComplete={handleIntroComplete} />;
}
