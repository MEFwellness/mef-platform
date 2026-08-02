/**
 * Root Motion System — generic Pulse primitive (Bible §3 "Pulse").
 * Reuses the app's existing `.mef-voice-pulse` class — a live/listening
 * state indicator (e.g. "the microphone is capturing right now"), not
 * ambient decoration. Per the Bible: gets real information, so unlike
 * Breathe/Float this deliberately does NOT gate on low-power mode —
 * only on reduced motion, handled entirely by the class's own `@media`
 * rule in app/globals.css. Pure function, no hooks needed.
 */

import type { CSSProperties, ReactNode } from 'react';

export function Pulse({
  children,
  className = '',
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={`mef-voice-pulse ${className}`} style={style}>
      {children}
    </span>
  );
}
