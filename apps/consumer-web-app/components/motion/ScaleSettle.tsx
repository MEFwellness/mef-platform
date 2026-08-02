/**
 * Root Motion System — generic Scale primitive (Bible §3 "Scale").
 * Wraps the app's existing `.mef-scale-settle` class (scale 1.6 -> 1
 * with the overshoot easing curve, Cinematic tier). Per the Bible's own
 * rule for this type: one focal element at a time — never wrap more
 * than one simultaneously-visible ScaleSettle on the same screen, or it
 * reads as chaos instead of a focal entrance. Pure function, no hooks.
 */

import type { CSSProperties, ReactNode } from 'react';

export function ScaleSettle({
  children,
  delayMs = 0,
  className = '',
  style,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`mef-scale-settle ${className}`} style={{ animationDelay: `${delayMs}ms`, ...style }}>
      {children}
    </div>
  );
}
