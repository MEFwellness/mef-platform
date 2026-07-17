'use client';

/**
 * Premium UX Milestone 1, Root Entry consolidation: several pages used to
 * offer a second way into Root — inline "Talk to Root" pills that did a
 * full navigation to the standalone /conversation page — alongside the
 * floating launcher that opens the same conversation in place. That's
 * exactly the "duplicate Root launch button" the milestone calls out, and
 * the full-page route was also a real navigation-speed cost (a fresh
 * server render + redirect/auth check per tap) for something the floating
 * panel already does instantly.
 *
 * This bus lets any button on a page ask the page's single
 * FloatingCoachLauncher to open with a specific entry point/context —
 * RootQuickLink is the button, FloatingCoachLauncher is the only
 * subscriber. A plain EventTarget (not React context) because the quick
 * links and the launcher are siblings, not parent/child, and are rendered
 * from Server Components that can't hold client state themselves.
 */

import { useEffect, useRef } from 'react';
import type { ConversationEntryPoint } from '@mef/shared-types-contracts';

export type RootOpenRequest = {
  entryPoint: ConversationEntryPoint;
  entryContext: string;
  starterPrompts?: string[] | undefined;
};

const OPEN_EVENT = 'mef:root-open-request';
const bus = new EventTarget();

export function requestOpenRoot(request: RootOpenRequest) {
  bus.dispatchEvent(new CustomEvent<RootOpenRequest>(OPEN_EVENT, { detail: request }));
}

export function useRootOpenRequests(handler: (request: RootOpenRequest) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    function onEvent(event: Event) {
      handlerRef.current((event as CustomEvent<RootOpenRequest>).detail);
    }
    bus.addEventListener(OPEN_EVENT, onEvent);
    return () => bus.removeEventListener(OPEN_EVENT, onEvent);
  }, []);
}
