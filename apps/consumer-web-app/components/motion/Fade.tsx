/**
 * Root Motion System — generic Fade primitive (Bible §3 "Fade").
 * Wraps the app's existing `.mef-fade-in` keyframe (Deliberate tier)
 * rather than defining a new one — the same class every opacity-only
 * entrance in this app already uses. No 'use client' needed: this is a
 * pure function with no hooks, safe to render from a Server Component.
 *
 * Reduced motion is handled entirely by `.mef-fade-in`'s own
 * `@media (prefers-reduced-motion: reduce)` rule in app/globals.css —
 * the animation is removed outright (not just shortened), so the
 * element renders at its natural, fully-visible state with no JS
 * branching required here.
 */

import type { CSSProperties, ReactNode } from 'react';

export function Fade({
  children,
  delayMs = 0,
  className = '',
  style,
}: {
  children: ReactNode;
  /** Beat delay before the fade starts, in ms — use §5's pacing beats (e.g. INTRO_REVEAL_TYPEWRITER_SETTLE_MS) for a Moment, or 0 for a Tool. */
  delayMs?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`mef-fade-in ${className}`} style={{ animationDelay: `${delayMs}ms`, ...style }}>
      {children}
    </div>
  );
}
