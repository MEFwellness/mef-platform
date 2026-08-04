/**
 * Branded "Reset" entry animation — stage durations, kept as a plain
 * (no 'use client') module per lib/introRevealTiming.ts's own convention,
 * so components/entry/RootResetEntryAnimation.tsx's setTimeout chain and
 * app/globals.css's animation-duration values can never drift apart.
 *
 * Full sequence totals 3600ms (brief calls for 3.2-3.8s, never over 4s).
 * Reduced-motion totals 1150ms (brief calls for roughly 1-1.5s).
 */
export const RESET_ENTRY_ARRIVE_MS = 700;
export const RESET_ENTRY_PRESS_MS = 600;
export const RESET_ENTRY_RELEASE_MS = 800;
export const RESET_ENTRY_WELCOME_MS = 900;
export const RESET_ENTRY_EXIT_MS = 600;

/**
 * How long to wait past the nominal welcome-stage start for the member's
 * first name to resolve before falling back to "Welcome back." anyway —
 * never blocks the sequence indefinitely. Only ever adds to the total in
 * the rare case the name genuinely isn't resolved yet by then (the
 * component schedules Welcome/Exit relative to when Welcome actually
 * starts, not as a fixed mount-relative offset, so this constant costs
 * nothing in the common case where the name already resolved). Kept small
 * enough that RESET_ENTRY_TOTAL_MS + this stays under the 4s hard ceiling
 * even in that worst case — see the test in
 * tests/entry-animation-rule.test.ts asserting exactly that.
 */
export const RESET_ENTRY_NAME_WAIT_MS = 300;

/** Hard backstop: forces the overlay to finish and unmount no matter what, so a stuck timer or failed fetch can never trap the member on the splash. */
export const RESET_ENTRY_SAFE_TIMEOUT_MS = 5000;

/**
 * Once the branded animation's own fixed duration has genuinely run its
 * course (RESET_ENTRY_TOTAL_MS, above), the destination page it's handing
 * off to may still be mid-navigation (a slow connection, a cold server
 * response). RootResetEntryGate.tsx bridges that gap with the app's own
 * skeleton loading treatment instead of ever revealing the stale previous
 * screen — this is the hard cap on how long the bridge itself may run
 * before giving up and revealing whatever is there, so a navigation that
 * never completes can never trap the member behind the skeleton either.
 * The branded animation's own choreography is never extended by this —
 * see RESET_ENTRY_SAFE_TIMEOUT_MS above for that, separate, guarantee.
 */
export const RESET_ENTRY_BRIDGE_MAX_MS = 8000;

/** The common-case total (name already resolved by Stage 4) — see RESET_ENTRY_NAME_WAIT_MS's own comment for the worst-case addendum. */
export const RESET_ENTRY_TOTAL_MS =
  RESET_ENTRY_ARRIVE_MS +
  RESET_ENTRY_PRESS_MS +
  RESET_ENTRY_RELEASE_MS +
  RESET_ENTRY_WELCOME_MS +
  RESET_ENTRY_EXIT_MS;

export const RESET_ENTRY_REDUCED_ARRIVE_MS = 400;
export const RESET_ENTRY_REDUCED_WELCOME_MS = 450;
export const RESET_ENTRY_REDUCED_EXIT_MS = 350;

export const RESET_ENTRY_REDUCED_TOTAL_MS =
  RESET_ENTRY_REDUCED_ARRIVE_MS + RESET_ENTRY_REDUCED_WELCOME_MS + RESET_ENTRY_REDUCED_EXIT_MS;
