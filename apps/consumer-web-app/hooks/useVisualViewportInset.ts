'use client';

/**
 * How much of the layout viewport's bottom edge is currently covered by
 * something the `visualViewport` API can see but fixed-position CSS
 * can't react to on its own — mainly the on-screen keyboard on iOS
 * Safari. `dvh` units (used for the coach sheet's height) already track
 * browser-chrome changes (address bar show/hide), but they do NOT shrink
 * for the keyboard on iOS Safari, which is exactly the "input hidden
 * behind the keyboard" bug this hook exists to fix — the floating coach
 * panel shifts itself up by this amount so its input row stays above the
 * keyboard instead of under it.
 */

import { useEffect, useState } from 'react';

export function useVisualViewportInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : undefined;
    if (!viewport) return;

    function update() {
      if (!viewport) return;
      const next = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(Math.max(0, Math.round(next)));
    }

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
