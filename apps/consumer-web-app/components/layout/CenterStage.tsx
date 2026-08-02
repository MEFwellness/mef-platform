/**
 * Screen Layout System — vertical centering for sparse content (Prompt 2
 * requirement 2). Wraps `.mef-center-viewport` (app/globals.css) in a
 * component so the intent ("this screen's content is short — center it
 * in the viewport instead of letting it hug the top with dead space
 * below") is explicit at the call site instead of a bare className.
 *
 * Reserve for genuinely sparse screens: a single question, a short
 * message, one card, a confirmation. A screen whose content already
 * fills the viewport (a long form, a multi-card list, a chart-heavy
 * Tool) should NOT use this — centering content that's already tall
 * does nothing, and centering content that grows (e.g. validation
 * errors appearing) causes a layout jump. When in doubt, don't wrap.
 */

import type { CSSProperties, ReactNode } from 'react';

export function CenterStage({
  children,
  className = '',
  /** Height of any fixed chrome (bottom nav, sticky header) this screen
   * renders alongside, in px — subtracted from the centering viewport so
   * content centers in the visible area, not behind the chrome. */
  chromeOffsetPx = 0,
  style,
}: {
  children: ReactNode;
  className?: string;
  chromeOffsetPx?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`mef-center-viewport ${className}`}
      style={{ ...(chromeOffsetPx ? { ['--mef-center-offset' as string]: `${chromeOffsetPx}px` } : {}), ...style }}
    >
      {children}
    </div>
  );
}
