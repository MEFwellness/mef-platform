'use client';

/**
 * Micro-Interactions (Prompt 6) — a quiet, premium acknowledgment for a
 * routine completed action (a saved meal, a saved target, a submitted
 * check-in): a ring and a checkmark that draw themselves in once, on
 * every mount. Reuses the exact draw primitives
 * `ClosingScreenPrimitives.tsx` already built for Signature Moments
 * (`.mef-close-check-circle` / `.mef-close-check-draw`, app/globals.css)
 * rather than a second implementation — this is the first real consumer
 * of `.mef-close-check-circle`, which existed in CSS but had no caller.
 * Deliberately never renders `.mef-close-gold-sweep`: Bible §9 reserves
 * the one-shot gold sweep for genuine first-completion milestones, and a
 * routine save getting it would cheapen the moments that should feel
 * special. No confetti, no streak framing. Reduced motion is handled
 * entirely by the CSS classes themselves (instant, fully drawn).
 */

import { useEffect, type CSSProperties } from 'react';
import { triggerHaptic } from '@/lib/haptics';

export function SuccessCheck({
  size = 40,
  color = '#1B3A2D',
  haptic = true,
  className = '',
  style,
}: {
  size?: number;
  color?: string;
  /** Fires one short haptic tick on mount — routine confirmations count as a "meaningful moment" per Bible §9, but only once, never per-frame. */
  haptic?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  useEffect(() => {
    if (haptic) triggerHaptic();
    // Intentionally fires once per mount, not per prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label="Done"
      className={className}
      style={style}
    >
      <circle cx="20" cy="20" r="18" stroke={color} strokeWidth="2" className="mef-close-check-circle" />
      <path
        d="M12 20.5L18 27L29 13"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mef-close-check-draw"
      />
    </svg>
  );
}
