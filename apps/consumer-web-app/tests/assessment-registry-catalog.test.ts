/**
 * Pure unit coverage for categorizeForCatalog's assignment-gated
 * visibility rule — hand-built definitions/facts, no DB, so this runs fast
 * and in isolation from tests/assessment-registry-integration.test.ts's
 * real-Supabase coverage of the same rule end to end.
 *
 * Coach-Assign-Only Gating task (2026-08-04) rewrote this file: an
 * assignment-gated, not-yet-assigned assessment used to categorize into
 * an invisible `hidden` section (a member saw nothing at all). Per the
 * explicit product requirement that gating be visible, not invisible, it
 * now lands in its normal Available/Premium section with
 * `flags.locked = true` and `flags.lockReasonKind = 'not_assigned'` —
 * exactly the same "locked flag on a normal card" shape every other lock
 * reason (membership/program/prerequisite) already used. `CatalogSection`
 * no longer has a `hidden` member at all.
 */
import { describe, it, expect } from 'vitest';
import { categorizeForCatalog } from '../lib/assessment-registry/catalog';
import { findAssessmentRegistryEntry } from '../lib/assessment-registry/registry';
import type { MemberAssessmentFacts } from '../lib/assessment-registry/status';

const BASE_FACTS: MemberAssessmentFacts = {
  membershipKey: 'holistic_reset',
  enrollment: null,
  completionStatus: 'not_started',
  latestCompletedAt: null,
  latestCompletedAttemptId: null,
  pendingAssignment: null,
  pendingReassessmentSchedule: null,
};

describe('categorizeForCatalog — coach-assign-only gating is visible, not hidden', () => {
  it('an assignment-gated, not-yet-assigned assessment renders as a real, locked card (never hidden)', () => {
    for (const key of [
      'four-doctors',
      'chek-hlc1-nutrition-lifestyle',
      'primal-pattern-diet-type',
      'short-haq',
      'wbsa',
      'body-assessment',
    ] as const) {
      const entry = findAssessmentRegistryEntry(key)!;
      expect(entry.requiresAssignment).toBe(true);

      const { section, flags } = categorizeForCatalog(entry, BASE_FACTS);
      expect(['available', 'premium']).toContain(section);
      expect(flags.locked).toBe(true);
      expect(flags.lockReasonKind).toBe('not_assigned');
      expect(flags.lockMessage).toBeTruthy();
    }
  });

  it('surfaces it in Assigned, unlocked, the moment a pending coach assignment exists', () => {
    for (const key of ['four-doctors', 'body-assessment'] as const) {
      const entry = findAssessmentRegistryEntry(key)!;
      const facts: MemberAssessmentFacts = {
        ...BASE_FACTS,
        pendingAssignment: {
          id: 'assignment-1',
          isRequired: true,
          reason: 'Coach follow-up.',
          dueAt: null,
          availableAt: new Date().toISOString(),
          stage: 'standard',
        },
      };

      const { section, flags } = categorizeForCatalog(entry, facts);
      expect(section).toBe('assigned');
      expect(flags.locked).toBe(false);
      expect(flags.lockReasonKind).toBeNull();
    }
  });

  it("a draft on an unassigned questionnaire no longer unlocks it, and a completion still keeps the card open", () => {
    const entry = findAssessmentRegistryEntry('chek-hlc1-nutrition-lifestyle')!;

    // A DRAFT IS NOT A KEY (2026-08-27). It used to be: an open draft made
    // calculateLockReason skip the assignment gate entirely, so the one
    // stray draft a page render created was enough to open a coach-only
    // questionnaire. The card is locked again, and nothing of hers is lost,
    // because she has nothing here yet.
    const withDraft = {
      ...BASE_FACTS,
      membershipKey: 'membership' as const,
      completionStatus: 'in_progress' as const,
    };
    const draftEntry = categorizeForCatalog(entry, withDraft);
    expect(draftEntry.flags.locked).toBe(true);
    expect(draftEntry.flags.lockReasonKind).toBe('not_assigned');

    // A real completion is different: the card is how she reaches her own
    // results, so it is never rendered as a lock.
    const withCompletion = {
      ...BASE_FACTS,
      membershipKey: 'membership' as const,
      completionStatus: 'completed' as const,
      latestCompletedAt: new Date().toISOString(),
      latestCompletedAttemptId: 'attempt-1',
    };
    const completedEntry = categorizeForCatalog(entry, withCompletion);
    expect(completedEntry.section).toBe('completed');
    expect(completedEntry.flags.locked).toBe(false);
    // What she may not do is start another one without a fresh assignment.
    expect(completedEntry.flags.retakeAvailable).toBe(false);
  });

  it('moves a completed, assignment-gated assessment to Completed, unlocked, even once its assignment row is no longer pending', () => {
    const entry = findAssessmentRegistryEntry('four-doctors')!;
    const facts: MemberAssessmentFacts = {
      ...BASE_FACTS,
      completionStatus: 'completed',
      latestCompletedAt: new Date().toISOString(),
      latestCompletedAttemptId: 'attempt-1',
      pendingAssignment: null, // migration 144's trigger already flipped it off 'pending'
    };

    const { section, flags } = categorizeForCatalog(entry, facts);
    expect(section).toBe('completed');
    expect(flags.locked).toBe(false);
  });

  it('never locks a self-serve assessment (requiresAssignment: false) regardless of assignment state', () => {
    // life-signal-check and readiness-pulse are excluded here on purpose:
    // both are requiresAssignment: false, but each has a real, unrelated
    // prerequisite lock (core-values-snapshot / life-signal-check) that
    // legitimately locks them under BASE_FACTS' empty completed-
    // prerequisites set — a different lock mechanism than this test is
    // about, already covered by their own dedicated prerequisite tests
    // elsewhere.
    for (const key of ['core-values-snapshot', 'onboarding-health-history'] as const) {
      const entry = findAssessmentRegistryEntry(key)!;
      expect(entry.requiresAssignment).toBe(false);
      const { flags } = categorizeForCatalog(entry, BASE_FACTS);
      expect(flags.locked).toBe(false);
      expect(flags.lockReasonKind).toBeNull();
    }
  });

  it('a coming-soon, assignment-gated placeholder shows as Coming Soon (visible), not as a locked card', () => {
    for (const key of ['readiness-to-change', 'finding-1-love'] as const) {
      const entry = findAssessmentRegistryEntry(key)!;
      expect(entry.requiresAssignment).toBe(true);
      const { section, flags } = categorizeForCatalog(entry, BASE_FACTS);
      expect(['available', 'premium']).toContain(section);
      expect(flags.comingSoon).toBe(true);
      expect(flags.locked).toBe(false);
    }
  });

  it('a membership-tier lock (not a coach-assignment lock) still reports its own lockReasonKind, distinct from not_assigned', () => {
    const entry = findAssessmentRegistryEntry('wbsa')!;
    // Force past the not_assigned gate so the membership check underneath
    // is what actually decides — a completed prior attempt lets
    // completionStatus through regardless of assignment/tier.
    const facts: MemberAssessmentFacts = {
      ...BASE_FACTS,
      membershipKey: 'free_trial',
      pendingAssignment: {
        id: 'assignment-1',
        isRequired: false,
        reason: null,
        dueAt: null,
        availableAt: new Date().toISOString(),
        stage: 'standard',
      },
    };
    // With a pending assignment, section is 'assigned' and lock is never
    // computed (assignment is an explicit override) — confirms the
    // assignment path takes priority over a membership lock, exactly as
    // calculateAssessmentStatus's own precedence already documents.
    const { section, flags } = categorizeForCatalog(entry, facts);
    expect(section).toBe('assigned');
    expect(flags.lockReasonKind).toBeNull();
  });
});
