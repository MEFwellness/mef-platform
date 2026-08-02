'use client';

/**
 * Root Motion System — generic Float primitive (Bible §3 "Float").
 * New: no floating/ambient-particle motion exists anywhere in this app
 * yet. Implements the Bible's exact spec (8-12s loop, <=6px vertical
 * drift, opacity capped <=0.15, ease-in-out) via the new `.mef-float`
 * keyframe added to app/globals.css alongside this prompt's token work.
 * Purely ambient, so per Bible §10 it's gated behind useLowPowerMode —
 * on a low-power device it renders children in a plain, unanimated
 * `<span>` instead.
 *
 * Not wired into any real screen by this prompt — Prompt 1 builds the
 * framework only; applying ambient motion to actual dashboard/Moment
 * surfaces is later work (Bible §11, §14 Prompt 5).
 */

import type { CSSProperties, ReactNode } from 'react';
import { useLowPowerMode } from '@/lib/motion/useLowPowerMode';
import { MOTION_AMBIENT_MAX_OPACITY, MOTION_FLOAT_DURATION_RANGE_MS } from '@/lib/motion/tokens';

export function Float({
  children,
  durationMs = 10000,
  maxOpacity = MOTION_AMBIENT_MAX_OPACITY,
  className = '',
  style,
}: {
  children?: ReactNode;
  durationMs?: number;
  maxOpacity?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const lowPowerMode = useLowPowerMode();
  const clampedDuration = Math.min(MOTION_FLOAT_DURATION_RANGE_MS.max, Math.max(MOTION_FLOAT_DURATION_RANGE_MS.min, durationMs));
  const clampedOpacity = Math.min(MOTION_AMBIENT_MAX_OPACITY, Math.max(0, maxOpacity));

  if (lowPowerMode) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }

  return (
    <span
      className={`mef-float ${className}`}
      style={
        {
          animationDuration: `${clampedDuration}ms`,
          '--mef-float-opacity': clampedOpacity,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}
