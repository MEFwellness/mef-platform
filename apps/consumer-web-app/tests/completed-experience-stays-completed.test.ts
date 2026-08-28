/**
 * BUG FIX, 2026-08-27: completed free experiences were being served again
 * the next day.
 *
 * Real testers reported "the questionnaire I finished yesterday is back
 * asking me to do it again". Production carried the signature in the data:
 * one member had FOUR completed Core Values Snapshot sessions, each one
 * started 1 to 2 seconds after the previous one finished, plus a fifth
 * empty draft still open.
 *
 * Two things had to be true at once for that to happen, and these tests
 * cover both halves.
 *
 *   1. Finishing an experience created a fresh empty draft of it. The take
 *      page starts a session while RENDERING, and finishing is a Next.js
 *      Server Action, which re-renders the page it was called from.
 *      Covered by tests/completed-experience-runtime-integration.test.ts
 *      against the real database.
 *
 *   2. That one empty draft made every surface forget she had finished,
 *      because `assessment_status_by_member` lets a draft outrank a
 *      completion and every reader took its `status` at face value. Covered
 *      here: the shared helper, the catalog sections, the free-arc pop-up
 *      and card, the prerequisite chain, and the Priority Card.
 *
 * Every "yesterday" here is a real US Eastern evening completion whose UTC
 * timestamp already reads as the NEXT day, which is the Protein Ledger
 * timezone bug class and the exact case the report described.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateAssessmentStatus,
  hasEverCompleted,
  hasRetakeInProgress,
  type MemberAssessmentFacts,
} from '../lib/assessment-registry/status';
import { categorizeForCatalog } from '../lib/assessment-registry/catalog';
import { findAssessmentRegistryEntry } from '../lib/assessment-registry/registry';
import { pickResumableAssessment } from '../lib/priority/service';
import { pickNextFreeArcCard, FREE_ARC_SEQUENCE } from '../lib/root-popup-messages/freeArc';
import type { AssessmentKey } from '../lib/assessment-registry/types';
import type { CatalogCard, QuestionnaireCatalog } from '../app/actions/questionnaireCatalog';
import { localDateStringFor } from '../lib/time/localDate';

/**
 * 2026-08-26, 9:40pm in New York. In UTC that instant is already
 * 2026-08-27, so a raw `.slice(0, 10)` reads it as tomorrow and any
 * "did she do this today" comparison built on one is wrong by a day.
 */
const EVENING_EASTERN_COMPLETION = '2026-08-27T01:40:00.000Z';
const EASTERN = 'America/New_York';

function facts(overrides: Partial<MemberAssessmentFacts> = {}): MemberAssessmentFacts {
  return {
    membershipKey: 'free_trial',
    enrollment: null,
    completionStatus: 'not_started',
    latestCompletedAt: null,
    latestCompletedAttemptId: null,
    pendingAssignment: null,
    pendingReassessmentSchedule: null,
    ...overrides,
  };
}

/** What the status view reports for a finished experience that has an empty draft sitting on top of it: a draft always wins its `status` column, and `latest_completed_at` keeps the completion. */
function finishedThenPhantomDraft(): MemberAssessmentFacts {
  return facts({ completionStatus: 'in_progress', latestCompletedAt: EVENING_EASTERN_COMPLETION });
}

function finishedCleanly(): MemberAssessmentFacts {
  return facts({ completionStatus: 'completed', latestCompletedAt: EVENING_EASTERN_COMPLETION });
}

function neverStarted(): MemberAssessmentFacts {
  return facts();
}

function partWayThroughAndNeverFinished(): MemberAssessmentFacts {
  return facts({ completionStatus: 'in_progress', latestCompletedAt: null });
}

const CVS = findAssessmentRegistryEntry('core-values-snapshot')!;
const LSC = findAssessmentRegistryEntry('life-signal-check')!;
const RPL = findAssessmentRegistryEntry('readiness-pulse')!;

/** "The next calendar day", as the app would compute it for her: the morning after that Eastern evening. */
const NEXT_MORNING = new Date('2026-08-27T13:00:00.000Z');

describe('hasEverCompleted — the one source of truth', () => {
  it('is true for a finished experience even while an empty draft sits on top of it', () => {
    expect(hasEverCompleted(finishedThenPhantomDraft())).toBe(true);
  });

  it('is true for a cleanly finished experience', () => {
    expect(hasEverCompleted(finishedCleanly())).toBe(true);
  });

  it('is false for one she has never finished, whether or not she has started it', () => {
    expect(hasEverCompleted(neverStarted())).toBe(false);
    expect(hasEverCompleted(partWayThroughAndNeverFinished())).toBe(false);
  });

  it('tells a retake in progress apart from a first attempt in progress', () => {
    expect(hasRetakeInProgress(finishedThenPhantomDraft())).toBe(true);
    expect(hasRetakeInProgress(partWayThroughAndNeverFinished())).toBe(false);
    expect(hasRetakeInProgress(finishedCleanly())).toBe(false);
  });
});

describe('the completed card, checked the next calendar day', () => {
  // A member who finished Life Signal Check has by definition finished
  // Core Values Snapshot before it, and so on down the chain. The set has
  // to be passed, because `retakeAvailable` now asks whether she may
  // genuinely start another one, and an unmet prerequisite is one of the
  // reasons she may not.
  const ALL_PREREQUISITES_MET = new Set(
    [CVS, LSC, RPL].map((e) => e.key)
  );

  for (const entry of [CVS, LSC, RPL]) {
    it(`${entry.displayName} stays in the Completed section with a draft sitting on it`, () => {
      const { section, flags } = categorizeForCatalog(
        entry,
        finishedThenPhantomDraft(),
        NEXT_MORNING,
        ALL_PREREQUISITES_MET
      );
      expect(section).toBe('completed');
      // Not "Resume". The card renders View Results off `inProgress` being false.
      expect(flags.inProgress).toBe(false);
      expect(flags.retakeInProgress).toBe(true);
      expect(flags.retakeAvailable).toBe(true);
    });

    it(`${entry.displayName} stays in the Completed section with no draft at all`, () => {
      const { section, flags } = categorizeForCatalog(
        entry,
        finishedCleanly(),
        NEXT_MORNING,
        ALL_PREREQUISITES_MET
      );
      expect(section).toBe('completed');
      expect(flags.inProgress).toBe(false);
      expect(flags.retakeInProgress).toBe(false);
    });

    it(`${entry.displayName} is still genuinely resumable when she has never finished it`, () => {
      const { section, flags } = categorizeForCatalog(entry, partWayThroughAndNeverFinished(), NEXT_MORNING);
      expect(section).toBe('available');
      expect(flags.inProgress).toBe(true);
      expect(flags.retakeInProgress).toBe(false);
    });
  }

  it('a completed experience reads as completed, not in progress', () => {
    expect(calculateAssessmentStatus(CVS, finishedThenPhantomDraft()).status).toBe('completed');
  });
});

describe('the free-arc pop-up and its dashboard card', () => {
  function cardFor(key: AssessmentKey, section: CatalogCard['section']): CatalogCard {
    const entry = findAssessmentRegistryEntry(key)!;
    const source = section === 'completed' ? finishedThenPhantomDraft() : neverStarted();
    return {
      key,
      title: entry.displayName,
      description: entry.shortDescription,
      estimatedMinutes: entry.estimatedMinutes,
      category: entry.category,
      section,
      flags: categorizeForCatalog(entry, source, NEXT_MORNING).flags,
      draftProgress: null,
      latestCompletedAt: section === 'completed' ? EVENING_EASTERN_COMPLETION : null,
      primaryHref: entry.route,
      resultHref: null,
      coachAssignmentReason: null,
      assignmentId: null,
    };
  }

  function catalogWith(cards: CatalogCard[]): QuestionnaireCatalog {
    const catalog: QuestionnaireCatalog = {
      assigned: [],
      completed: [],
      premium: [],
      available: [],
      totalCount: cards.length,
      completedCount: 0,
    };
    for (const card of cards) catalog[card.section].push(card);
    catalog.completedCount = catalog.completed.length;
    return catalog;
  }

  it('offers the next conversation, not one she finished last night', () => {
    const catalog = catalogWith([
      cardFor('core-values-snapshot', 'completed'),
      cardFor('life-signal-check', 'available'),
      cardFor('readiness-pulse', 'available'),
    ]);
    expect(pickNextFreeArcCard(catalog)?.key).toBe('life-signal-check');
  });

  it('offers nothing at all once all three are finished, phantom drafts and all', () => {
    const catalog = catalogWith(FREE_ARC_SEQUENCE.map((key) => cardFor(key, 'completed')));
    expect(pickNextFreeArcCard(catalog)).toBeNull();
  });
});

describe('the prerequisite chain', () => {
  it('does not re-lock Life Signal Check behind a Core Values Snapshot she has finished', () => {
    const completedKeys = new Set<AssessmentKey>(
      ([['core-values-snapshot', finishedThenPhantomDraft()]] as const)
        .filter(([, f]) => hasEverCompleted(f))
        .map(([key]) => key)
    );
    const { flags } = categorizeForCatalog(LSC, neverStarted(), NEXT_MORNING, completedKeys);
    expect(flags.locked).toBe(false);
  });

  it('still locks Life Signal Check for somebody who has genuinely never finished the first one', () => {
    const { flags } = categorizeForCatalog(LSC, neverStarted(), NEXT_MORNING, new Set<AssessmentKey>());
    expect(flags.locked).toBe(true);
    expect(flags.lockReasonKind).toBe('prerequisite');
  });
});

describe('the Priority Card', () => {
  it('never picks an experience she has already completed', () => {
    for (const key of FREE_ARC_SEQUENCE) {
      const map = new Map<AssessmentKey, MemberAssessmentFacts>([[key, finishedThenPhantomDraft()]]);
      expect(pickResumableAssessment(map)).toBeNull();
    }
  });

  it('never picks any of the three when all three are finished with drafts on top', () => {
    const map = new Map<AssessmentKey, MemberAssessmentFacts>(
      FREE_ARC_SEQUENCE.map((key) => [key, finishedThenPhantomDraft()] as const)
    );
    expect(pickResumableAssessment(map)).toBeNull();
  });

  it('still picks one she genuinely started and never finished', () => {
    const map = new Map<AssessmentKey, MemberAssessmentFacts>([
      ['core-values-snapshot', finishedThenPhantomDraft()],
      ['life-signal-check', partWayThroughAndNeverFinished()],
    ]);
    expect(pickResumableAssessment(map)?.key).toBe('life-signal-check');
  });
});

describe('an evening completion that crosses the UTC day boundary', () => {
  it('is filed on the day she actually lived, not the UTC day after it', () => {
    expect(localDateStringFor(EVENING_EASTERN_COMPLETION, EASTERN)).toBe('2026-08-26');
    // What the code used to do, kept here so the difference is visible.
    expect(EVENING_EASTERN_COMPLETION.slice(0, 10)).toBe('2026-08-27');
  });

  it('still counts as completed the next morning, on every surface', () => {
    const evening = finishedThenPhantomDraft();
    expect(hasEverCompleted(evening)).toBe(true);
    expect(categorizeForCatalog(CVS, evening, NEXT_MORNING).section).toBe('completed');
    expect(pickResumableAssessment(new Map([['core-values-snapshot', evening]]))).toBeNull();
    expect(calculateAssessmentStatus(CVS, evening).status).toBe('completed');
  });
});
