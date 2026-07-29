'use client';

/**
 * Root Map — lets the ring (RootMapRing.tsx, a client component) tell the
 * "Not Covered Yet" section (RootMapNotCoveredSection.tsx) which of the
 * four uninstrumented domains was just tapped, so that section can mark
 * the specific one instead of leaving all four looking identical after a
 * jump. Same plain-EventTarget-bus shape as lib/root-launcher-bus.ts, for
 * the same reason: the two components are siblings under app/root-map/page.tsx
 * (a Server Component), not parent/child, so they can't share React state
 * directly.
 */

import { useEffect, useRef } from 'react';

const EVENT = 'mef:root-map-highlight';
const bus = new EventTarget();

export function requestRootMapHighlight(domain: string) {
  bus.dispatchEvent(new CustomEvent<string>(EVENT, { detail: domain }));
}

export function useRootMapHighlightRequests(handler: (domain: string) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    function onEvent(event: Event) {
      handlerRef.current((event as CustomEvent<string>).detail);
    }
    bus.addEventListener(EVENT, onEvent);
    return () => bus.removeEventListener(EVENT, onEvent);
  }, []);
}
