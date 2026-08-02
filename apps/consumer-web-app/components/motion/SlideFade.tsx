/**
 * Root Motion System — generic Slide primitive (Bible §3 "Slide").
 * Wraps the app's existing `.mef-animate-in` class (the `mef-fade-up`
 * keyframe — opacity + an 8px translateY settle, now Deliberate-tier
 * token-driven per app/globals.css). Pure function, no hooks — safe in
 * a Server Component. Reduced motion is handled by the class's own
 * `@media` rule, same as Fade.
 */

import type { CSSProperties, ReactNode } from 'react';

export function SlideFade({
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
    <div className={`mef-animate-in ${className}`} style={{ animationDelay: `${delayMs}ms`, ...style }}>
      {children}
    </div>
  );
}
