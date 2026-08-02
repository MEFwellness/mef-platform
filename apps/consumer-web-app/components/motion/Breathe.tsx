'use client';

/**
 * Root Motion System — generic Breathe primitive (Bible §3 "Breathe").
 * Reuses the app's two existing breathing keyframes rather than
 * inventing a third: `slow` (`.mef-root-score-breathe`, 6s — "this is a
 * living, current measurement," per that class's own comment in
 * app/globals.css) and `waiting` (`.mef-pulse-dot`, 2.2s — a calm
 * "waiting" signal). Purely ambient/decorative, so per Bible §10 this
 * is gated behind useLowPowerMode (battery/device tier, not just
 * reduced motion) — unlike Pulse, which signals real live state and
 * only respects reduced motion. Bible §3/§10 also caps ambient motion
 * at one breathing element per screen; that's a call-site discipline,
 * not something this component can enforce on its own.
 */

import type { CSSProperties, ReactNode } from 'react';
import { useLowPowerMode } from '@/lib/motion/useLowPowerMode';

const BREATHE_CLASS = {
  slow: 'mef-root-score-breathe',
  waiting: 'mef-pulse-dot',
} as const;

export function Breathe({
  children,
  speed = 'slow',
  className = '',
  style,
}: {
  children: ReactNode;
  speed?: keyof typeof BREATHE_CLASS;
  className?: string;
  style?: CSSProperties;
}) {
  const lowPowerMode = useLowPowerMode();

  return (
    <span className={`${lowPowerMode ? '' : BREATHE_CLASS[speed]} ${className}`} style={style}>
      {children}
    </span>
  );
}
