/**
 * THE PLAN MAP AND THE GATE (Build 2, 2026-08-27), tested against every
 * questionnaire, every plan, and coach-assigned both ways.
 *
 * The rule this file holds to account, in one sentence: `minLevel` is the
 * gate, a coach assignment may ADD access for one member, and nothing else
 * opens or closes anything. Not a reassessment schedule, not a worsening
 * finding, not an in-progress draft, not a page render, not a prior
 * completion, and no longer a coach-assign-only flag either.
 *
 * The `requiresAssignment` flag this file used to test is gone. It could
 * only ever subtract access, it sat underneath the plan where nothing
 * printed it, and it is why the map written down in BUILD_STATUS.md and
 * the map the app actually enforced were two different maps. A missing
 * assignment now decides nothing at all.
 *
 * Pure, and deliberately so. Every case here runs `calculateLockReason`
 * and `categorizeForCatalog` against hand-built facts, which is what the
 * card, the overview screen, the take route and every session-writing
 * server action all reach through (via lib/assessment-registry/access.ts).
 * tests/coach-assignment-adds-only.test.ts covers the same rule end to end
 * against real Supabase, real RLS and the real take/session paths; this
 * file is the exhaustive matrix, because an exhaustive matrix against a
 * live database would be several hundred round trips to say the same
 * thing.
 */
import { describe, it, expect } from 'vitest';
import {
  findAssessmentRegistryEntry,
  listAssessmentRegistryEntries,
} from '../lib/assessment-registry/registry';
import {
  calculateLockReason,
  calculateAssessmentStatus,
  type MemberAssessmentFacts,
} from '../lib/assessment-registry/status';
import { categorizeForCatalog } from '../lib/assessment-registry/catalog';
import {
  membershipKeyForAccessTier,
  membershipMeetsMinimum,
} from '../lib/assessment-registry/membership';
import { lockNoteMessage } from '../lib/locked-content/copy';
import type { AssessmentKey, MembershipKey } from '../lib/assessment-registry/types';

/**
 * THE MAP AS SHIPPED. Written out by hand, on purpose: a test that read
 * `entry.membership.minLevel` and asserted it equalled
 * `entry.membership.minLevel` would pass no matter what the map said.
 * Changing a row here without changing the registry (or the other way
 * round) fails.
 */
const PLAN_MAP: Record<AssessmentKey, MembershipKey> = {
  'onboarding-health-history': 'free_trial',
  'core-values-snapshot': 'free_trial',
  'life-signal-check': 'free_trial',
  'readiness-pulse': 'free_trial',
  'short-haq': 'membership',
  'primal-pattern-diet-type': 'membership',
  'chek-hlc1-nutrition-lifestyle': 'membership',
  'readiness-to-change': 'membership',
  'finding-1-love': 'membership',
  'four-doctors': 'holistic_reset',
  wbsa: 'holistic_reset',
  'body-assessment': 'holistic_reset',
};

/** The plans as they are actually assigned on /admin/access, and what each one means to the registry. */
const PLANS = [
  { tier: 'trial', key: 'free_trial' as MembershipKey },
  { tier: 'monthly', key: 'membership' as MembershipKey },
  { tier: 'annual', key: 'membership' as MembershipKey },
  { tier: 'program', key: 'holistic_reset' as MembershipKey },
] as const;

const ALL = listAssessmentRegistryEntries();
const LIVE = ALL.filter((e) => e.implementationStatus === 'live' && e.isActive && !e.isComingSoon);

/** The clinical ones: everything her plan does not include at trial level. */
const CLINICAL_KEYS = (Object.keys(PLAN_MAP) as AssessmentKey[]).filter(
  (key) => PLAN_MAP[key] !== 'free_trial'
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

const COMPLETED = {
  completionStatus: 'completed' as const,
  latestCompletedAt: new Date().toISOString(),
  latestCompletedAttemptId: 'attempt-1',
};

/** Every prerequisite met, so a prerequisite lock never shadows the rule a case is actually about. */
const ALL_PREREQUISITES: ReadonlySet<AssessmentKey> = new Set(ALL.map((e) => e.key));

describe('the map as shipped, all twelve rows', () => {
  it('covers every registry entry and nothing else', () => {
    expect(ALL.map((e) => e.key).sort()).toEqual((Object.keys(PLAN_MAP) as string[]).sort());
  });

  it.each(Object.entries(PLAN_MAP))('%s requires %s', (key, minLevel) => {
    const entry = findAssessmentRegistryEntry(key)!;
    expect(entry.membership.minLevel).toBe(minLevel);
  });

  it('allowedLevels never contradicts minLevel', () => {
    for (const entry of ALL) {
      for (const level of ['free_trial', 'membership', 'holistic_reset'] as MembershipKey[]) {
        expect(entry.membership.allowedLevels.includes(level)).toBe(
          membershipMeetsMinimum(level, entry.membership.minLevel)
        );
      }
    }
  });

  it('the free arc is exactly the four experiences a trial reaches', () => {
    const trialReachable = ALL.filter((e) => e.membership.minLevel === 'free_trial').map(
      (e) => e.key
    );
    expect(trialReachable.sort()).toEqual([
      'core-values-snapshot',
      'life-signal-check',
      'onboarding-health-history',
      'readiness-pulse',
    ]);
  });

  it('Whole-Body Check-In sits with the 24 week program, which is the deliberate move up', () => {
    expect(findAssessmentRegistryEntry('wbsa')!.membership.minLevel).toBe('holistic_reset');
  });
});

describe('the coach-assign-only lock is retired, not merely unused', () => {
  it('no registry entry carries a requiresAssignment flag any more', () => {
    for (const entry of ALL) {
      expect(entry).not.toHaveProperty('requiresAssignment');
    }
  });

  it("no lock reason any surface can produce says 'not assigned'", () => {
    const kinds = new Set<string>();
    for (const entry of ALL) {
      for (const plan of PLANS) {
        for (const extra of [
          {},
          { pendingReassessmentSchedule: SCHEDULE },
          { completionStatus: 'in_progress' as const },
          COMPLETED,
        ]) {
          const reason = calculateLockReason(
            entry,
            facts({ membershipKey: plan.key, ...extra }),
            ALL_PREREQUISITES
          );
          if (reason) kinds.add(reason.kind);
        }
      }
    }
    expect(kinds.has('not_assigned')).toBe(false);
    // Non-vacuous: the sweep is genuinely producing locks, not nothing.
    expect(kinds.has('membership')).toBe(true);
  });

  it('every lock a member can meet on a card has a sentence, and none of them mentions a coach', () => {
    for (const entry of ALL) {
      for (const plan of PLANS) {
        const reason = calculateLockReason(entry, facts({ membershipKey: plan.key }), new Set());
        if (!reason) continue;
        const note = lockNoteMessage(reason);
        expect(note.length).toBeGreaterThan(0);
        expect(note.toLowerCase()).not.toContain('coach');
        expect(note).not.toContain('—');
      }
    }
  });
});

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

describe('questionnaire x plan x coach-assigned: the whole matrix', () => {
  for (const entry of ALL) {
    for (const plan of PLANS) {
      const withinPlan = membershipMeetsMinimum(plan.key, PLAN_MAP[entry.key]);

      it(`${entry.key} on ${plan.tier}, no assignment: ${withinPlan ? 'open' : 'locked to the plan'}`, () => {
        const reason = calculateLockReason(
          entry,
          facts({ membershipKey: plan.key }),
          ALL_PREREQUISITES
        );
        if (withinPlan) {
          expect(reason).toBeNull();
        } else {
          expect(reason).toEqual({ kind: 'membership', requiredLevel: PLAN_MAP[entry.key] });
        }
      });

      it(`${entry.key} on ${plan.tier}, coach-assigned: open`, () => {
        const reason = calculateLockReason(
          entry,
          facts({ membershipKey: plan.key, pendingAssignment: ASSIGNMENT }),
          ALL_PREREQUISITES
        );
        expect(reason).toBeNull();
      });
    }
  }
});

describe('the card agrees with the gate, for every plan', () => {
  for (const entry of LIVE) {
    for (const plan of PLANS) {
      const withinPlan = membershipMeetsMinimum(plan.key, PLAN_MAP[entry.key]);

      it(`${entry.key} on ${plan.tier}: the card is ${withinPlan ? 'startable' : 'locked'}`, () => {
        const memberFacts = facts({ membershipKey: plan.key });
        const { flags } = categorizeForCatalog(entry, memberFacts, new Date(), ALL_PREREQUISITES);
        const { status } = calculateAssessmentStatus(entry, memberFacts, ALL_PREREQUISITES);

        expect(flags.locked).toBe(!withinPlan);
        expect(status).toBe(withinPlan ? 'available' : 'locked');

        if (!withinPlan) {
          // A locked card says which plan, and says it in the sheet too.
          expect(flags.lockReasonKind).toBe('membership');
          expect(flags.lockRequiredLevel).toBe(PLAN_MAP[entry.key]);
          expect(flags.lockNote).toBe(
            lockNoteMessage({ kind: 'membership', requiredLevel: PLAN_MAP[entry.key] })
          );
        } else {
          expect(flags.lockNote).toBeNull();
        }
      });

      it(`${entry.key} on ${plan.tier}: the section never contradicts the card`, () => {
        const { section, flags } = categorizeForCatalog(
          entry,
          facts({ membershipKey: plan.key }),
          new Date(),
          ALL_PREREQUISITES
        );
        // A card her PLAN does not reach is always in Premium, never in
        // Available. Available is only ever the trial-level shelf.
        if (flags.lockReasonKind === 'membership') expect(section).toBe('premium');
        if (section === 'available') expect(flags.lockReasonKind).not.toBe('membership');
      });
    }
  }
});

describe('the one lock that still sits in Available, and it is not a plan lock', () => {
  /**
   * The free arc is deliberately shown whole: Life Signal Check and
   * Readiness Pulse are trial-level and sit in Available with a
   * prerequisite lock until the step before them is finished. That is a
   * step in a sequence she can complete today, not a plan she is outside
   * of, and it says so.
   */
  it('a free-arc step waiting on the one before it is trial-level, and says step, not plan', () => {
    for (const key of ['life-signal-check', 'readiness-pulse'] as AssessmentKey[]) {
      const entry = findAssessmentRegistryEntry(key)!;
      const { section, flags } = categorizeForCatalog(
        entry,
        facts({ membershipKey: 'free_trial' }),
        new Date(),
        new Set()
      );
      expect(section).toBe('available');
      expect(flags.lockReasonKind).toBe('prerequisite');
      expect(flags.lockNote).toContain('step before this one');
    }
  });
});

describe('the lock sentence a member reads names her plan, not a coach', () => {
  it('a Monthly questionnaire on a trial plan reads as Monthly', () => {
    const entry = findAssessmentRegistryEntry('short-haq')!;
    const { flags } = categorizeForCatalog(
      entry,
      facts({ membershipKey: 'free_trial' }),
      new Date(),
      ALL_PREREQUISITES
    );
    expect(flags.lockNote).toContain('Monthly plan');
  });

  it('a 24 week program questionnaire on a monthly plan reads as the 24 week program', () => {
    for (const key of ['four-doctors', 'wbsa', 'body-assessment'] as AssessmentKey[]) {
      const { flags } = categorizeForCatalog(
        findAssessmentRegistryEntry(key)!,
        facts({ membershipKey: 'membership' }),
        new Date(),
        ALL_PREREQUISITES
      );
      expect(flags.lockNote).toContain('24 week program');
    }
  });
});

describe('no trial account reaches a clinical questionnaire without an assignment', () => {
  it.each(CLINICAL_KEYS)('%s is locked on trial', (key) => {
    const reason = calculateLockReason(
      findAssessmentRegistryEntry(key)!,
      facts({ membershipKey: 'free_trial' }),
      ALL_PREREQUISITES
    );
    expect(reason).toEqual({ kind: 'membership', requiredLevel: PLAN_MAP[key] });
  });

  it.each(CLINICAL_KEYS)('%s opens on trial once a coach assigns it', (key) => {
    const reason = calculateLockReason(
      findAssessmentRegistryEntry(key)!,
      facts({ membershipKey: 'free_trial', pendingAssignment: ASSIGNMENT }),
      ALL_PREREQUISITES
    );
    expect(reason).toBeNull();
  });
});

describe('a 24 week program member reaches all twelve', () => {
  it.each(Object.keys(PLAN_MAP) as AssessmentKey[])('%s is open on the program plan', (key) => {
    const reason = calculateLockReason(
      findAssessmentRegistryEntry(key)!,
      facts({ membershipKey: 'holistic_reset' }),
      ALL_PREREQUISITES
    );
    expect(reason).toBeNull();
  });
});

describe('Whole-Body Check-In specifically, because it moved', () => {
  const wbsa = findAssessmentRegistryEntry('wbsa')!;

  it('a monthly member without an assignment is locked, and told about the program', () => {
    expect(calculateLockReason(wbsa, facts({ membershipKey: 'membership' }), new Set())).toEqual({
      kind: 'membership',
      requiredLevel: 'holistic_reset',
    });
  });

  it('a program member is open', () => {
    expect(
      calculateLockReason(wbsa, facts({ membershipKey: 'holistic_reset' }), new Set())
    ).toBeNull();
  });

  it('an assignment opens it for a trial member', () => {
    expect(
      calculateLockReason(
        wbsa,
        facts({ membershipKey: 'free_trial', pendingAssignment: ASSIGNMENT }),
        new Set()
      )
    ).toBeNull();
  });

  /**
   * The real production state: one member has an abandoned, zero-answer
   * Whole-Body Check-In draft and has never completed it. She is now on
   * the wrong side of the plan for it, and the draft must not be worth
   * anything: not access, not a card, not a resume.
   */
  it('an abandoned zero-answer draft grants nothing and shows nothing', () => {
    const abandoned = facts({ membershipKey: 'membership', completionStatus: 'in_progress' });

    expect(calculateLockReason(wbsa, abandoned, new Set())).toEqual({
      kind: 'membership',
      requiredLevel: 'holistic_reset',
    });

    const { status } = calculateAssessmentStatus(wbsa, abandoned, new Set());
    expect(status).toBe('locked');

    const { flags, section } = categorizeForCatalog(wbsa, abandoned, new Date(), new Set());
    expect(flags.inProgress).toBe(false);
    expect(flags.retakeInProgress).toBe(false);
    expect(flags.locked).toBe(true);
    expect(section).toBe('premium');
  });
});

describe('nothing else opens anything', () => {
  // Each case uses a member whose PLAN does not reach the questionnaire,
  // because the plan is the only gate now. Each fails the moment its guard
  // is removed from calculateLockReason.
  const OUTSIDE_TRIAL = CLINICAL_KEYS.map((key) => findAssessmentRegistryEntry(key)!);

  it('a pending reassessment schedule does not, which is A1', () => {
    expect(OUTSIDE_TRIAL.length).toBeGreaterThan(0);
    for (const entry of OUTSIDE_TRIAL) {
      expect(
        calculateLockReason(
          entry,
          facts({ membershipKey: 'free_trial', pendingReassessmentSchedule: SCHEDULE }),
          ALL_PREREQUISITES
        )
      ).toEqual({ kind: 'membership', requiredLevel: PLAN_MAP[entry.key] });
    }
  });

  it('an in-progress draft does not', () => {
    for (const entry of OUTSIDE_TRIAL) {
      expect(
        calculateLockReason(
          entry,
          facts({ membershipKey: 'free_trial', completionStatus: 'in_progress' }),
          ALL_PREREQUISITES
        )
      ).toEqual({ kind: 'membership', requiredLevel: PLAN_MAP[entry.key] });
    }
  });

  it('a prior completion does not', () => {
    for (const entry of OUTSIDE_TRIAL) {
      expect(
        calculateLockReason(
          entry,
          facts({ membershipKey: 'free_trial', ...COMPLETED }),
          ALL_PREREQUISITES
        )
      ).toEqual({ kind: 'membership', requiredLevel: PLAN_MAP[entry.key] });
    }
  });

  it('and a prior completion still never hides her results: the card reads completed, not locked', () => {
    for (const entry of OUTSIDE_TRIAL) {
      if (entry.isComingSoon) continue;
      const { status } = calculateAssessmentStatus(
        entry,
        facts({ membershipKey: 'free_trial', ...COMPLETED }),
        ALL_PREREQUISITES
      );
      expect(status).toBe('completed');
    }
  });
});

describe('the reassessment badge needs both halves', () => {
  const REASSESSABLE = LIVE.filter((e) => !e.program.programOnly);

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
          ...COMPLETED,
          pendingReassessmentSchedule: SCHEDULE,
        }),
        ALL_PREREQUISITES
      );
      expect(status).toBe('scheduled');
    }
  });
});

describe('the camera Body Assessment is on exactly the same gate', () => {
  const body = findAssessmentRegistryEntry('body-assessment')!;

  it('is a real, live registry entry, so the cases above genuinely covered it', () => {
    expect(body.implementationStatus).toBe('live');
    expect(body.membership.minLevel).toBe('holistic_reset');
  });

  it('does not open for a trial member with a half-finished capture', () => {
    expect(
      calculateLockReason(
        body,
        facts({ membershipKey: 'free_trial', completionStatus: 'in_progress' }),
        ALL_PREREQUISITES
      )
    ).toEqual({ kind: 'membership', requiredLevel: 'holistic_reset' });
  });

  it('does not open for a phantom schedule against it, which is the exact production row', () => {
    expect(
      calculateLockReason(
        body,
        facts({ membershipKey: 'free_trial', pendingReassessmentSchedule: SCHEDULE }),
        ALL_PREREQUISITES
      )
    ).toEqual({ kind: 'membership', requiredLevel: 'holistic_reset' });
  });
});
