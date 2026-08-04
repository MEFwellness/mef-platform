/**
 * Free Arc Discoverability fix (2026-08-03) — a brand-new member had no
 * reachable path (card or pop-up) to Core Values Snapshot, Life Signal
 * Check, or Readiness Pulse until after their first, entirely unrelated,
 * daily check-in (app/dashboard/page.tsx's `!hasCheckins` gate hid
 * everything below the top-priority zone, and the pop-up itself was only
 * ever passed through when `hasCheckins` was true). This module picks
 * "the next unstarted conversation in the free arc" so both the new
 * `free_arc_available` Root pop-up (app/actions/rootPopupMessages.ts) and
 * its dashboard card can surface it — including for a member with zero
 * check-ins.
 *
 * Reads lib/assessment-registry/registry.ts's own real, server-enforced
 * prerequisite chain (Core Values Snapshot -> Life Signal Check ->
 * Readiness Pulse) rather than re-deciding sequencing here — prerequisites
 * match this exact order, so the first not-yet-completed key in the list
 * is always unlocked by construction; this never needs to separately check
 * `flags.locked`.
 */

import type { AssessmentKey } from '@/lib/assessment-registry/types';
import type { CatalogCard, QuestionnaireCatalog } from '@/app/actions/questionnaireCatalog';

export const FREE_ARC_SEQUENCE: AssessmentKey[] = [
  'core-values-snapshot',
  'life-signal-check',
  'readiness-pulse',
];

export function freeArcPopupMessageKey(key: AssessmentKey): string {
  return `free_arc_available:${key}`;
}

/** The next conversation in the free arc this member hasn't completed yet, or null once all three are done. */
export function pickNextFreeArcCard(catalog: QuestionnaireCatalog): CatalogCard | null {
  const completedKeys = new Set(catalog.completed.map((c) => c.key));
  for (const key of FREE_ARC_SEQUENCE) {
    if (completedKeys.has(key)) continue;
    return catalog.available.find((c) => c.key === key) ?? null;
  }
  return null;
}
