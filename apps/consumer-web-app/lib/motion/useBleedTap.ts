'use client';

import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Micro-Interactions (Prompt 6) — the tap-origin-capture half of the
 * app's one selection language (Bible §9 "Selection ripple"), factored
 * out of `TapBleedTile` (components/checkin/scales/shared.tsx, the
 * original implementation) so any other selection control with its own
 * bespoke card shape/color — one that can't just render TapBleedTile
 * directly — can still bleed-fill from the real tap point instead of
 * inventing a second, competing selection language.
 *
 * Pair with `.mef-press` on the pressable element, and a
 * `<span aria-hidden className="mef-bleed-fill" style={{ backgroundColor }} />`
 * absolutely positioned inside it (the element itself needs `relative
 * isolate overflow-hidden`), toggled visible by adding `mef-bleed-active`
 * to the pressable element when selected. Both CSS classes already live
 * in app/globals.css. Fire `triggerHaptic()` (lib/haptics.ts) from the
 * same click handler that changes selection, same as every other caller.
 */
export function useBleedTap() {
  const [origin, setOrigin] = useState('50% 50%');

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  }

  return {
    onPointerDown,
    bleedStyle: { '--bleed-origin': origin } as CSSProperties,
  };
}
