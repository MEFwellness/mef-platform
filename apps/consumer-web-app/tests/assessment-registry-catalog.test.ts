/**
 * Pure unit coverage for categorizeForCatalog's assignment-gated
 * visibility rule (Assignment-Gated Questionnaires task) — hand-built
 * definitions/facts, no DB, so this runs fast and in isolation from
 * tests/assessment-registry-integration.test.ts's real-Supabase coverage
 * of the same rule end to end.
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

describe('categorizeForCatalog — assignment-gated visibility', () => {
  it('hides an assignment-gated, not-yet-started assessment entirely (not even locked/premium)', () => {
    const entry = findAssessmentRegistryEntry('four-doctors')!;
    expect(entry.requiresAssignment).toBe(true);

    const { section } = categorizeForCatalog(entry, BASE_FACTS);
    expect(section).toBe('hidden');
  });

  it('surfaces it in Assigned the moment a pending coach assignment exists', () => {
    const entry = findAssessmentRegistryEntry('four-doctors')!;
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

    const { section } = categorizeForCatalog(entry, facts);
    expect(section).toBe('assigned');
  });

  it('never hides a member\'s own in-progress draft, even with no assignment', () => {
    const entry = findAssessmentRegistryEntry('four-doctors')!;
    const facts: MemberAssessmentFacts = { ...BASE_FACTS, completionStatus: 'in_progress' };

    const { section } = categorizeForCatalog(entry, facts);
    expect(section).not.toBe('hidden');
  });

  it('moves a completed, assignment-gated assessment to Completed, off the hidden/assigned path, even once its assignment row is no longer pending', () => {
    const entry = findAssessmentRegistryEntry('four-doctors')!;
    const facts: MemberAssessmentFacts = {
      ...BASE_FACTS,
      completionStatus: 'completed',
      latestCompletedAt: new Date().toISOString(),
      latestCompletedAttemptId: 'attempt-1',
      pendingAssignment: null, // migration 144's trigger already flipped it off 'pending'
    };

    const { section } = categorizeForCatalog(entry, facts);
    expect(section).toBe('completed');
  });

  it('never hides a self-serve assessment (requiresAssignment: false) regardless of assignment state', () => {
    for (const key of ['core-values-snapshot', 'life-signal-check', 'onboarding-health-history'] as const) {
      const entry = findAssessmentRegistryEntry(key)!;
      expect(entry.requiresAssignment).toBe(false);
      const { section } = categorizeForCatalog(entry, BASE_FACTS);
      expect(section).not.toBe('hidden');
    }
  });

  it('a coming-soon, assignment-gated placeholder stays hidden rather than falling through to a coming_soon card', () => {
    for (const key of ['readiness-to-change', 'finding-1-love'] as const) {
      const entry = findAssessmentRegistryEntry(key)!;
      expect(entry.requiresAssignment).toBe(true);
      const { section } = categorizeForCatalog(entry, BASE_FACTS);
      expect(section).toBe('hidden');
    }
  });
});
