/**
 * THE GATE (2026-08-27), tested against every live questionnaire and every
 * plan, plus the camera Body Assessment.
 *
 * The rule this file holds to account, in one sentence: access is decided
 * by the member's plan, a coach assignment may additionally open one
 * specific questionnaire for one specific member, and NOTHING else opens
 * anything. Not a reassessment schedule, not a worsening finding, not an
 * in-progress draft, not a page render, not a prior completion.
 *
 * Pure, and deliberately so. Every case here is `calculateLockReason`
 * against hand-built facts, which is the one function the card, the
 * overview, the take route and every session-writing server action all
 * reach through. tests/assessment-registry-integration.test.ts covers the
 * same rule end to end against real Supabase and real RLS; this file is
 * the exhaustive matrix, because an exhaustive matrix against a live
 * database would be several hundred round trips to say the same thing.
 */
import { describe, it, expect } from 'vitest';
import { listAssessmentRegistryEntries } from '../lib/assessment-registry/registry';
import {
  calculateLockReason,
  calculateAssessmentStatus,
  type MemberAssessmentFacts,
} from '../lib/assessment-registry/status';
import {
  membershipKeyForAccessTier,
  membershipMeetsMinimum,
} from '../lib/assessment-registry/membership';
import type { AssessmentKey, MembershipKey } from '../lib/assessment-registry/types';

/** The plans as they are actually assigned on /admin/access, and what each one means to the registry. */
const PLANS = [
  { tier: 'trial', key: 'free_trial' as MembershipKey },
  { tier: 'monthly', key: 'membership' as MembershipKey },
  { tier: 'annual', key: 'membership' as MembershipKey },
  { tier: 'program', key: 'holistic_reset' as MembershipKey },
] as const;

const LIVE = listAssessmentRegistryEntries().filter(
  (e) => e.implementationStatus === 'live' && e.isActive && !e.isComingSoon
);

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

const ASSIGNMENT = {
  id: 'assignment-1',
  isRequired: true,
  reason: null,
  dueAt: null,
  availableAt: new Date(0).toISOString(),
  stage: 'baseline',
};

const SCHEDULE = {
  id: 'schedule-1',
  stage: 'finding_triggered',
  dueAt: new Date(Date.now() - 86_400_000).toISOString(),
};

/** Every prerequisite met, so a prerequisite lock never shadows the rule a case is actually about. */
const ALL_PREREQUISITES: ReadonlySet<AssessmentKey> = new Set(LIVE.map((e) => e.key));

describe('the plan vocabulary maps onto the registry vocabulary, and fails closed', () => {
  it.each(PLANS)('$tier resolves to $key', ({ tier, key }) => {
    expect(membershipKeyForAccessTier(tier, 'active')).toBe(key);
  });

  it('no access at all is the most restrictive live plan', () => {
    expect(membershipKeyForAccessTier('none', 'active')).toBe('free_trial');
  });

  it('an expired or cancelled subscription stops counting, whatever tier it names', () => {
    expect(membershipKeyForAccessTier('program', 'expired')).toBe('free_trial');
    expect(membershipKeyForAccessTier('program', 'canceled')).toBe('free_trial');
  });

  it('an unrecognized tier resolves to the most restrictive plan, never the most permissive', () => {
    expect(membershipKeyForAccessTier('platinum', 'active')).toBe('free_trial');
    expect(membershipKeyForAccessTier(null, null)).toBe('free_trial');
  });
});

describe('plan x questionnaire: a plan that does not reach it says so, and names the plan', () => {
  for (const entry of LIVE) {
    for (const plan of PLANS) {
      const reaches = membershipMeetsMinimum(plan.key, entry.membership.minLevel);

      it(`${entry.key} on a ${plan.tier} plan: ${reaches ? 'within the plan' : 'outside the plan'}`, () => {
        const reason = calculateLockReason(
          entry,
          facts({ membershipKey: plan.key }),
          ALL_PREREQUISITES
        );

        if (!reaches) {
          // Outside her plan is the FIRST thing she is told, ahead of the
          // coach gate, because it is the one she can act on.
          expect(reason).toEqual({
            kind: 'membership',
            requiredLevel: entry.membership.minLevel,
          });
          return;
        }

        // Within her plan, the only thing that can still be missing is a
        // coach assignment or a program rule.
        if (entry.requiresAssignment) {
          expect(reason).toEqual({ kind: 'not_assigned' });
        } else if (!entry.program.programOnly) {
          expect(reason).toBeNull();
        }
      });
    }
  }
});

describe('a coach assignment adds access, and its absence never blocks a plan that includes it', () => {
  for (const entry of LIVE) {
    it(`${entry.key} opens for any plan once a coach assigns it`, () => {
      for (const plan of PLANS) {
        const reason = calculateLockReason(
          entry,
          facts({ membershipKey: plan.key, pendingAssignment: ASSIGNMENT }),
          ALL_PREREQUISITES
        );
        expect(reason).toBeNull();
      }
    });
  }

  it('a self-serve questionnaire never waits on a coach', () => {
    const selfServe = LIVE.filter((e) => !e.requiresAssignment && !e.program.programOnly);
    expect(selfServe.length).toBeGreaterThan(0);
    for (const entry of selfServe) {
      const reason = calculateLockReason(
        entry,
        facts({ membershipKey: 'holistic_reset' }),
        ALL_PREREQUISITES
      );
      expect(reason).toBeNull();
    }
  });
});

describe('nothing else opens anything', () => {
  // The four things that used to, one case each, across every live
  // questionnaire. Each of these fails the moment its guard is removed
  // from calculateLockReason.
  const COACH_ONLY = LIVE.filter((e) => e.requiresAssignment);

  it('a pending reassessment schedule does not, which is A1', () => {
    expect(COACH_ONLY.length).toBeGreaterThan(0);
    for (const entry of COACH_ONLY) {
      const reason = calculateLockReason(
        entry,
        facts({ membershipKey: 'holistic_reset', pendingReassessmentSchedule: SCHEDULE }),
        ALL_PREREQUISITES
      );
      expect(reason).toEqual({ kind: 'not_assigned' });
    }
  });

  it('an in-progress draft does not', () => {
    for (const entry of COACH_ONLY) {
      const reason = calculateLockReason(
        entry,
        facts({ membershipKey: 'holistic_reset', completionStatus: 'in_progress' }),
        ALL_PREREQUISITES
      );
      expect(reason).toEqual({ kind: 'not_assigned' });
    }
  });

  it('a prior completion does not', () => {
    for (const entry of COACH_ONLY) {
      const reason = calculateLockReason(
        entry,
        facts({
          membershipKey: 'holistic_reset',
          completionStatus: 'completed',
          latestCompletedAt: new Date().toISOString(),
          latestCompletedAttemptId: 'attempt-1',
        }),
        ALL_PREREQUISITES
      );
      expect(reason).toEqual({ kind: 'not_assigned' });
    }
  });

  it('and a prior completion still never hides her results: the card reads completed, not locked', () => {
    for (const entry of COACH_ONLY) {
      const { status } = calculateAssessmentStatus(
        entry,
        facts({
          membershipKey: 'free_trial',
          completionStatus: 'completed',
          latestCompletedAt: new Date().toISOString(),
          latestCompletedAttemptId: 'attempt-1',
        }),
        ALL_PREREQUISITES
      );
      expect(status).toBe('completed');
    }
  });
});

describe('the reassessment badge needs both halves', () => {
  const REASSESSABLE = LIVE.filter((e) => !e.requiresAssignment && !e.program.programOnly);

  it('a schedule with no completion is not a reassessment', () => {
    for (const entry of REASSESSABLE) {
      const { status } = calculateAssessmentStatus(
        entry,
        facts({ membershipKey: 'holistic_reset', pendingReassessmentSchedule: SCHEDULE }),
        ALL_PREREQUISITES
      );
      expect(status).not.toBe('scheduled');
    }
  });

  it('a schedule with a completion, on a plan that includes it, is', () => {
    for (const entry of REASSESSABLE) {
      const { status } = calculateAssessmentStatus(
        entry,
        facts({
          membershipKey: 'holistic_reset',
          completionStatus: 'completed',
          latestCompletedAt: new Date().toISOString(),
          latestCompletedAttemptId: 'attempt-1',
          pendingReassessmentSchedule: SCHEDULE,
        }),
        ALL_PREREQUISITES
      );
      expect(status).toBe('scheduled');
    }
  });
});

describe('the camera Body Assessment is on exactly the same gate', () => {
  const body = LIVE.find((e) => e.key === 'body-assessment')!;

  it('is a real, live registry entry, so the cases above genuinely covered it', () => {
    expect(body).toBeDefined();
    expect(body.requiresAssignment).toBe(true);
  });

  it('does not open for a member with a half-finished capture and no assignment', () => {
    expect(
      calculateLockReason(
        body,
        facts({ membershipKey: 'holistic_reset', completionStatus: 'in_progress' }),
        ALL_PREREQUISITES
      )
    ).toEqual({ kind: 'not_assigned' });
  });

  it('does not open for a member with a phantom schedule against it, which is the exact production row', () => {
    expect(
      calculateLockReason(
        body,
        facts({ membershipKey: 'free_trial', pendingReassessmentSchedule: SCHEDULE }),
        ALL_PREREQUISITES
      )
    ).toEqual({ kind: 'not_assigned' });
  });
});
