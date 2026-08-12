/**
 * Root Motion System — the in-card staged reveal helper.
 *
 * `StaggerItem` (components/motion/Stagger.tsx) wraps each child in its
 * own `<div>`, which is right for a list of separate cards but wrong
 * inside one card: the wrapper divs break the card's own margin rhythm
 * and turn a paragraph into a block for no reason. This helper applies
 * the same idea as props on the real element instead, so a heading stays
 * a heading.
 *
 * Deliberately a plain (no 'use client') module returning a plain object,
 * same discipline as lib/introRevealTiming.ts and lib/motion/tokens.ts:
 * a Server Component may need to stage its own markup, and importing from
 * a Client Component module would make every export a client reference.
 *
 * Reduced motion is handled entirely by `.mef-reveal-step`'s own
 * `@media (prefers-reduced-motion: reduce)` rule in app/globals.css —
 * the delay stays in the style object but animates nothing, so the
 * element is simply there, instantly.
 */

import { MOTION_MAX_STAGGER_ITEMS, MOTION_STAGGER_STEP_TIGHT_MS } from './tokens';

export type RevealStepProps = {
  className: string;
  style: { animationDelay: string };
};

/**
 * Spread onto the element that should arrive at position `index` of its
 * card's own reveal, passing that element's own classes through:
 *
 *   <p {...revealStep(2, 'mt-3 text-sm')}>...</p>
 *
 * The element's classes go THROUGH this call rather than sitting beside
 * the spread on purpose. A spread that returns its own `className` silently
 * overwrites one written next to it (TypeScript flags it as TS2783, which
 * is how this signature was arrived at), and the failure is invisible in
 * review: the animation works and the element quietly loses its styling.
 *
 * Capped at MOTION_MAX_STAGGER_ITEMS (Bible §6) for the same reason
 * StaggerItem is: past that the delay tail stops reading as rhythm and
 * starts reading as a wait.
 */
export function revealStep(
  index: number,
  className = '',
  stepMs: number = MOTION_STAGGER_STEP_TIGHT_MS
): RevealStepProps {
  const cappedIndex = Math.max(0, Math.min(index, MOTION_MAX_STAGGER_ITEMS - 1));
  return {
    className: className ? `mef-reveal-step ${className}` : 'mef-reveal-step',
    style: { animationDelay: `${cappedIndex * stepMs}ms` },
  };
}

/** The moment the last element of a group of `count` reveal steps has finished arriving. */
export function revealStepTotalMs(
  count: number,
  stepMs: number = MOTION_STAGGER_STEP_TIGHT_MS,
  durationMs = 320
): number {
  if (count <= 0) return 0;
  const cappedLast = Math.min(count - 1, MOTION_MAX_STAGGER_ITEMS - 1);
  return cappedLast * stepMs + durationMs;
}
