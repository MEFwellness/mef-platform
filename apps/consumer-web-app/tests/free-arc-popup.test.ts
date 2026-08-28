/**
 * Free Arc Discoverability fix (2026-08-03) — lib/root-popup-messages/freeArc.ts
 * picks "the next unstarted conversation" among Core Values Snapshot, Life
 * Signal Check, and Readiness Pulse, for both the new `free_arc_available`
 * Root pop-up and its dashboard card. This proved a real, confirmed bug: a
 * brand-new member had no reachable path to any of the three until after
 * an unrelated first daily check-in.
 */
import { describe, it, expect } from 'vitest';
import {
  FREE_ARC_SEQUENCE,
  freeArcPopupMessageKey,
  pickNextFreeArcCard,
} from '../lib/root-popup-messages/freeArc';
import type { CatalogCard, QuestionnaireCatalog } from '../app/actions/questionnaireCatalog';
import type { AssessmentKey } from '../lib/assessment-registry/types';

function card(key: AssessmentKey, overrides: Partial<CatalogCard> = {}): CatalogCard {
  return {
    key,
    title: `Title for ${key}`,
    description: `Description for ${key}`,
    estimatedMinutes: 5,
    category: 'test',
    section: 'available',
    flags: {
      locked: false,
      lockMessage: null,
      lockReasonKind: null,
    lockRequiredLevel: null,
      comingSoon: false,
      inProgress: false,
      retakeInProgress: false,
      reassessmentDueAt: null,
      scheduledAt: null,
      retakeAvailable: false,
    },
    draftProgress: null,
    latestCompletedAt: null,
    primaryHref: `/assessments/${key}`,
    resultHref: null,
    coachAssignmentReason: null,
    assignmentId: null,
    ...overrides,
  };
}

function emptyCatalog(): QuestionnaireCatalog {
  return { assigned: [], completed: [], premium: [], available: [], totalCount: 0, completedCount: 0 };
}

describe('FREE_ARC_SEQUENCE', () => {
  it('is Core Values Snapshot, then Life Signal Check, then Readiness Pulse, in that order', () => {
    expect(FREE_ARC_SEQUENCE).toEqual(['core-values-snapshot', 'life-signal-check', 'readiness-pulse']);
  });
});

describe('freeArcPopupMessageKey', () => {
  it('is stable and distinct per assessment key', () => {
    expect(freeArcPopupMessageKey('core-values-snapshot')).toBe('free_arc_available:core-values-snapshot');
    expect(freeArcPopupMessageKey('life-signal-check')).not.toBe(
      freeArcPopupMessageKey('readiness-pulse')
    );
  });
});

describe('pickNextFreeArcCard', () => {
  it('picks Core Values Snapshot for a brand-new member with zero history — the exact case that was previously unreachable', () => {
    const catalog = emptyCatalog();
    catalog.available.push(card('core-values-snapshot'), card('some-other-key' as AssessmentKey));
    const result = pickNextFreeArcCard(catalog);
    expect(result?.key).toBe('core-values-snapshot');
  });

  it('picks Life Signal Check once Core Values Snapshot is completed', () => {
    const catalog = emptyCatalog();
    catalog.completed.push(card('core-values-snapshot'));
    catalog.available.push(card('life-signal-check'));
    const result = pickNextFreeArcCard(catalog);
    expect(result?.key).toBe('life-signal-check');
  });

  it('picks Readiness Pulse once both Core Values Snapshot and Life Signal Check are completed', () => {
    const catalog = emptyCatalog();
    catalog.completed.push(card('core-values-snapshot'), card('life-signal-check'));
    catalog.available.push(card('readiness-pulse'));
    const result = pickNextFreeArcCard(catalog);
    expect(result?.key).toBe('readiness-pulse');
  });

  it('returns null once all three are completed', () => {
    const catalog = emptyCatalog();
    catalog.completed.push(
      card('core-values-snapshot'),
      card('life-signal-check'),
      card('readiness-pulse')
    );
    expect(pickNextFreeArcCard(catalog)).toBeNull();
  });

  it('never skips ahead to a later conversation while an earlier one is still unstarted, even if its card is missing from available', () => {
    // Defensive case: core-values-snapshot not completed and not present in
    // `available` either (shouldn't happen in practice, but must not
    // silently recommend Life Signal Check, which would bypass the real
    // prerequisite chain).
    const catalog = emptyCatalog();
    catalog.available.push(card('life-signal-check'));
    expect(pickNextFreeArcCard(catalog)).toBeNull();
  });
});
