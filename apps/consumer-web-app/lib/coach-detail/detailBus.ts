'use client';

/**
 * "Open that section and take me to that card", and "put this in the
 * Assign panel's own field".
 *
 * A PLAIN EVENT TARGET, for the same reason lib/root-map/highlightBus.ts
 * is one. The pinned search, the six collapsible sections and the Assign
 * panel are all siblings under a Server Component, not parent and child,
 * so they cannot share React state and there is no client component high
 * enough to hold it without pulling the whole page across the boundary.
 *
 * A REQUEST IS HELD UNTIL SOMEBODY TAKES IT, AND IS TAKEN ONCE.
 *
 * This is the whole difference between this bus and the Root Map one, and
 * it exists because a plain dispatch was WRONG here in two ways that both
 * showed up the moment the components were driven rather than described:
 *
 *   THE ASSIGN PANEL IS NOT MOUNTED WHEN THE REQUEST IS MADE. It lives
 *     inside a folded section, and a folded section renders nothing, so at
 *     the instant a coach taps a questionnaire result its subscriber does
 *     not exist yet. A bare dispatch reached nobody, the section then
 *     opened, and the field arrived empty.
 *   THE DEEP LINK RUNS BEFORE THE SECTIONS SUBSCRIBE. DetailDeepLink sits
 *     above the sections in the tree, and React runs effects in tree
 *     order, so its "open App Controls" fired before App Controls had
 *     added its own listener. An arriving #member-visibility would have
 *     landed on a folded page.
 *
 * So each channel keeps its last unclaimed request. A subscriber that
 * mounts afterwards takes it on mount, and taking it clears it, so a
 * section that is folded and reopened later does not replay an old jump
 * and the Assign field is not refilled behind a coach's back.
 */

import { useEffect, useRef } from 'react';

const OPEN_SECTION = 'mef:coach-detail-open-section';
const ASSIGN_QUERY = 'mef:coach-detail-assign-query';

const bus = new EventTarget();

export type OpenSectionRequest = {
  sectionId: string;
  /** What to scroll to once it is open. The section's own anchor when the request was about the section itself. */
  anchorId: string;
};

/** The last request nobody has taken yet, per channel. */
let pendingSection: OpenSectionRequest | null = null;
let pendingAssignQuery: string | null = null;

export function requestDetailSection(request: OpenSectionRequest): void {
  pendingSection = request;
  bus.dispatchEvent(new CustomEvent<OpenSectionRequest>(OPEN_SECTION, { detail: request }));
}

/**
 * One section listening for its own name.
 *
 * The bus does the matching rather than the handler, because "did anyone
 * take this" is a fact about the request and not about the caller, and
 * only the section the request names is allowed to clear it.
 */
export function useDetailSectionRequests(
  sectionId: string,
  onOpen: (anchorId: string) => void
): void {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    function take(request: OpenSectionRequest) {
      if (request.sectionId !== sectionId) return;
      if (pendingSection === request) pendingSection = null;
      onOpenRef.current(request.anchorId);
    }

    // Anything already waiting for this section, claimed on mount.
    if (pendingSection && pendingSection.sectionId === sectionId) take(pendingSection);

    function onEvent(event: Event) {
      take((event as CustomEvent<OpenSectionRequest>).detail);
    }
    bus.addEventListener(OPEN_SECTION, onEvent);
    return () => bus.removeEventListener(OPEN_SECTION, onEvent);
  }, [sectionId]);
}

/** Pre-fills the Assign panel's own search field, which then filters exactly as it does when typed into. */
export function requestAssignSearchQuery(query: string): void {
  pendingAssignQuery = query;
  bus.dispatchEvent(new CustomEvent<string>(ASSIGN_QUERY, { detail: query }));
}

export function useAssignSearchQueryRequests(onQuery: (query: string) => void): void {
  const onQueryRef = useRef(onQuery);
  onQueryRef.current = onQuery;

  useEffect(() => {
    const waiting = pendingAssignQuery;
    if (waiting !== null) {
      pendingAssignQuery = null;
      onQueryRef.current(waiting);
    }

    function onEvent(event: Event) {
      pendingAssignQuery = null;
      onQueryRef.current((event as CustomEvent<string>).detail);
    }
    bus.addEventListener(ASSIGN_QUERY, onEvent);
    return () => bus.removeEventListener(ASSIGN_QUERY, onEvent);
  }, []);
}

/** For tests: forget anything nobody took, so one case cannot leak into the next. */
export function resetDetailBusForTests(): void {
  pendingSection = null;
  pendingAssignQuery = null;
}
