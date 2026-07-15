'use client';

/**
 * Locks background page scroll while a modal overlay (the floating coach
 * bottom sheet) is open. `overflow: hidden` on the body alone is not
 * reliable on iOS Safari — touchmove can still rubber-band the page
 * behind a fixed-position overlay — so this uses the standard
 * `position: fixed` + restore-scroll-offset technique instead, which does
 * fully pin the page underneath.
 */

import { useEffect } from 'react';

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    const { body } = document;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
