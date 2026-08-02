/**
 * Root Motion System — duration and easing tokens (Prompt 1), mirroring
 * the CSS custom properties declared at the top of app/globals.css
 * (`:root { --mef-duration-*; --mef-ease-*; }`). Kept as a plain,
 * non-'use client' module — same discipline as lib/introRevealTiming.ts
 * — so a Server Component can safely import numeric values for
 * setTimeout/animationDelay math without pulling in a client boundary.
 *
 * These numbers must stay in sync with app/globals.css's own token
 * block by hand; there is no build-time bridge from CSS custom
 * properties into JS in this project. If a tier's canonical value ever
 * changes, update both places together — see globals.css's own comment
 * for which existing keyframes each canonical value was chosen to match.
 *
 * Per docs/motion-experience-bible.md §4.
 */

export const MOTION_DURATION_MS = {
  instant: 100,
  quick: 150,
  standard: 320,
  deliberate: 500,
  cinematic: 600,
  epic: 2000,
} as const;

export type MotionDurationTier = keyof typeof MOTION_DURATION_MS;

export const MOTION_EASE = {
  standard: 'ease-out',
  overshoot: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  decelerate: 'cubic-bezier(0.16, 1, 0.3, 1)',
  ambient: 'cubic-bezier(0.45, 0, 0.55, 1)',
  draw: 'cubic-bezier(0.65, 0, 0.35, 1)',
  step: 'step-end',
} as const;

export type MotionEaseName = keyof typeof MOTION_EASE;

/** Bible §6: staggered groups cap at 8 items before the delay tail stops reading as rhythm and starts reading as a wait. */
export const MOTION_MAX_STAGGER_ITEMS = 8;

/** Bible §3 "Stagger": the default per-item delay step for a StaggerItem group. */
export const MOTION_STAGGER_STEP_MS = 90;

/** Bible §3 "Float" / §10: ambient float drift must stay within an 8-12s loop. */
export const MOTION_FLOAT_DURATION_RANGE_MS = { min: 8000, max: 12000 } as const;

/** Bible §10: ambient motion opacity delta must never exceed 15 percentage points. */
export const MOTION_AMBIENT_MAX_OPACITY = 0.15;
