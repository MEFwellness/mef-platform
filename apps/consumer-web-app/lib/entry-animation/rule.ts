/**
 * Branded "Reset" entry animation — the session-entry rule, kept as a
 * plain (no 'use client') pure module so it's unit-testable without any
 * Next.js/cookie/request plumbing, same discipline as
 * lib/introRevealTiming.ts and lib/entry-animation/timing.ts.
 *
 * THE RULE, in plain language:
 * 1. A fresh sign-in (the login form's signIn() action) always plays it.
 * 2. Otherwise, it plays when the member's browser hasn't talked to this
 *    server in at least REOPEN_THRESHOLD_MS — which is true both for "the
 *    app was fully closed and reopened" (a brand-new browsing context has
 *    no mef_entry_last_active cookie history to compare against yet, or —
 *    since the cookie is domain-scoped, not tab-scoped — carries an old
 *    timestamp from days ago) and for "backgrounded a long time, tab never
 *    actually closed" (middleware.ts refreshes mef_entry_last_active on
 *    every request, so a long gap with zero requests is exactly a long
 *    background/closed period, and a normal few-seconds-between-clicks
 *    gap during active browsing never crosses the threshold).
 * 3. It never plays on a public/pre-auth route, a first-run member Moment
 *    that already owns its own cinematic entrance (Welcome flow,
 *    onboarding, the post-verification name screen), or anywhere under
 *    /coach or /admin — this animation is specifically "the member
 *    pressing the Rooted Reset logo," not a coach/admin moment.
 *
 * Browser vs installed/PWA: this app has no service worker and no
 * distinct standalone-mode lifecycle handling (app/manifest.ts declares
 * `display: 'standalone'` for "Add to Home Screen," but nothing else
 * changes). An installed PWA that gets killed by the OS and relaunched
 * performs a fresh HTTP request exactly like a browser reopening a closed
 * tab, so rule #2 above covers both identically — there is deliberately no
 * separate PWA code path.
 */

/** "Meaningful period" backgrounded/closed before the animation replays. Not specified exactly by the brief; 30 minutes was chosen as a reasonable "you've stepped away" threshold, well past normal in-app navigation gaps and well short of "gone for the day." */
export const ENTRY_ANIMATION_REOPEN_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Routes that never show the entry animation, regardless of auth/gap
 * state. Deliberately a separate, purpose-curated list rather than a
 * reuse of middleware.ts's PUBLIC_PATHS: that list exists to decide the
 * auth *access* boundary (several of its entries, like /api/lead-capture
 * or /api/cron/, are irrelevant to a page-level splash), while this one
 * decides where a login/welcome moment would ever make sense to show.
 */
const ENTRY_ANIMATION_EXCLUDED_PREFIXES = [
  // Public / pre-auth
  '/login',
  '/signup',
  '/verify',
  '/reset-password',
  '/start',
  '/wellness-check',
  '/lead-widget-test',
  // First-run member Moments that already own their own cinematic entrance
  // (Bible §2's "Full Screen Inventory") — this splash is for a
  // *returning* member ("Welcome back"), not someone completing signup.
  '/welcome',
  '/onboarding',
  '/name',
  // Coach/admin — Bible §2: "no coach-facing screen ever gets cinematic
  // pacing, regardless of how rich the underlying data is." Admin is the
  // same internal-tooling standard.
  '/coach',
  '/admin',
] as const;

export function isEntryAnimationExcludedPath(path: string): boolean {
  return ENTRY_ANIMATION_EXCLUDED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export interface EntryAnimationPlayDecisionInput {
  /** Whether a signed-in user exists on this request. */
  hasUser: boolean;
  /** The request's path, e.g. "/dashboard". */
  path: string;
  /** Whether the middleware's own PUBLIC_PATHS check already treats this path as public. */
  isPublicPath: boolean;
  /** Whether the signIn() action set the one-shot "just logged in" cookie on this request. */
  justLoggedIn: boolean;
  /** Parsed mef_entry_last_active cookie value (ms epoch), or null if absent. */
  lastActiveAtMs: number | null;
  /** Current time (ms epoch) — injected rather than read internally so this stays pure/testable. */
  nowMs: number;
}

export function decideEntryAnimationPlay(input: EntryAnimationPlayDecisionInput): boolean {
  if (!input.hasUser) return false;
  if (input.isPublicPath || isEntryAnimationExcludedPath(input.path)) return false;
  if (input.justLoggedIn) return true;
  if (input.lastActiveAtMs === null) return true;
  return input.nowMs - input.lastActiveAtMs >= ENTRY_ANIMATION_REOPEN_THRESHOLD_MS;
}
