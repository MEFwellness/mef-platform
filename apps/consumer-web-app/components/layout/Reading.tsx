/**
 * Screen Layout System — reading-width cap for body copy (Prompt 2
 * requirement 4). Wraps `.mef-reading` (app/globals.css, 42rem/672px —
 * the app's existing max-w-2xl, already its dominant text measure).
 * Apply to the text block itself, not the card/section containing it —
 * a card or chart is allowed to run wider than this.
 *
 * Left-aligned (does not auto-center) by default — most body copy in
 * this app sits under a left-aligned heading/icon, and centering it
 * visually detaches it from its own label. Pass `center` for the
 * Moment-style centered-prose case instead (Welcome/Onboarding/closing
 * screens).
 */

import type { CSSProperties, ReactNode } from 'react';

export function Reading({
  children,
  center = false,
  className = '',
  style,
}: {
  children: ReactNode;
  center?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`${center ? 'mef-reading-center' : 'mef-reading'} ${className}`} style={style}>
      {children}
    </div>
  );
}
