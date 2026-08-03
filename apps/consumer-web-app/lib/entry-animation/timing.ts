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

/** How long to wait past the nominal welcome-stage start for the member's first name to resolve before falling back to "Welcome back." anyway — never blocks the sequence indefinitely. */
export const RESET_ENTRY_NAME_WAIT_MS = 800;

/** Hard backstop: forces the overlay to finish and unmount no matter what, so a stuck timer or failed fetch can never trap the member on the splash. */
export const RESET_ENTRY_SAFE_TIMEOUT_MS = 5000;

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
