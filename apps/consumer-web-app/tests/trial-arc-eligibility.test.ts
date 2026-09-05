/**
 * THE SIX RULES, HELD BY THE BUILD.
 *
 * Every one of these is a rule somebody could remove by accident while
 * meaning to fix something else, and every one of them is the difference
 * between an automated sequence reaching a stranger on their free trial
 * and reaching somebody's coaching client. So each is asserted on its own,
 * with everything else about the account set up to pass, which is what
 * makes a failure name the rule that broke rather than "eligibility is
 * false again".
 *
 * The companion source scan lives in tests/trial-arc-suppression-guard.ts.
 * This file is about what the rules decide; that one is about who may
 * write the one stored input they read.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveRelationship,
  describeRelationship,
  type RelationshipFacts,
} from '@/lib/membership/relationship';
import { decideTrialArcEligibility } from '@/lib/trial-arc/eligibility';
import { TRIAL_ARC_LAUNCH, trialArcLaunchInstant } from '@/lib/trial-arc/config';

/** A pretend launch, well before the accounts below, used everywhere the arc has to be switched on to test anything else. */
const LAUNCH = '2026-09-01T00:00:00.000Z';
const NOW = new Date('2026-09-10T12:00:00.000Z');

/**
 * An account that passes all six rules. Every test below starts here and
 * breaks exactly one thing, so nothing can pass by accident.
 */
function eligibleFacts(overrides: Partial<RelationshipFacts> = {}): RelationshipFacts {
  return {
    memberId: '11111111-1111-4111-8111-111111111111',
    activeCoachAssignment: false,
    everCoachAssigned: false,
    coachAssignmentStatuses: [],
    hasSubscription: true,
    tier: 'trial',
    source: 'system',
    status: 'active',
    fullAccess: false,
    isTest: false,
    accountCreatedAt: '2026-09-05T09:00:00.000Z',
    trialArcSuppressedAt: null,
    readFailed: false,
    ...overrides,
  };
}

function decide(overrides: Partial<RelationshipFacts> = {}, launch: string | null = LAUNCH) {
  return decideTrialArcEligibility({ facts: eligibleFacts(overrides), now: NOW, launch });
}

describe('the fixture itself', () => {
  it('is eligible, so every refusal below is caused by the one thing that test changed', () => {
    const result = decide();
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('eligible');
    expect(result.relationship).toBe('PROSPECT');
  });
});

describe('rule 1 — the launch date is the switch, and it is also the line', () => {
  /**
   * SHIPPED LAUNCHED, on 2026-09-05 (prompt 7). The instant is asserted
   * here rather than left free, because it is the one value in this build
   * that decides who the arc talks to, and a change to it should have to be
   * a change to this line too.
   *
   * Setting it back to null re-silences the arc for everybody, which the
   * block below still proves: every shape of account answers
   * 'launch_not_set' when the launch is null, and rule 1 is checked first
   * on purpose so nothing about an account can overrule it.
   */
  it('ships as the launch instant, not as null', () => {
    expect(TRIAL_ARC_LAUNCH).toBe('2026-09-05T16:00:00Z');
    expect(trialArcLaunchInstant()?.toISOString()).toBe('2026-09-05T16:00:00.000Z');
  });

  it('and putting it back to null silences the arc again, without touching a row', () => {
    expect(trialArcLaunchInstant(null)).toBeNull();
    expect(decide({}, null).reason).toBe('launch_not_set');
  });

  it('refuses an otherwise perfect account', () => {
    const result = decide({}, null);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('launch_not_set');
  });

  /**
   * The important half: with the launch unset, NOTHING about an account can
   * make it eligible. Every shape below is refused with the same reason,
   * including shapes that would be refused for a different reason if the
   * arc were on, because rule 1 is checked first on purpose.
   */
  it('refuses every shape of account there is', () => {
    const shapes: Partial<RelationshipFacts>[] = [
      {},
      { isTest: true },
      { hasSubscription: false, tier: null, source: null, status: null },
      { tier: 'monthly' },
      { fullAccess: true },
      { activeCoachAssignment: true, everCoachAssigned: true, coachAssignmentStatuses: ['active'] },
      { everCoachAssigned: true, coachAssignmentStatuses: ['revoked'] },
      { trialArcSuppressedAt: '2026-09-06T00:00:00.000Z' },
      { accountCreatedAt: '2020-01-01T00:00:00.000Z' },
      { readFailed: true },
    ];
    for (const shape of shapes) {
      const result = decide(shape, null);
      expect(result.eligible, JSON.stringify(shape)).toBe(false);
      expect(result.reason, JSON.stringify(shape)).toBe('launch_not_set');
    }
  });

  it('treats an unparseable launch date exactly like null, so a typo can only silence the arc', () => {
    expect(decide({}, 'not a date').reason).toBe('launch_not_set');
  });

  it('excludes an account created before the launch, which is what replaces a backfill', () => {
    const result = decide({ accountCreatedAt: '2026-08-31T23:59:59.000Z' });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('account_predates_launch');
  });

  it('includes an account created in the launch instant itself', () => {
    expect(decide({ accountCreatedAt: LAUNCH }).eligible).toBe(true);
  });
});

describe('rule 4 — any coach assignment, in any status, ever, excludes the account permanently', () => {
  const shapes: [string, Partial<RelationshipFacts>][] = [
    ['active', { activeCoachAssignment: true, everCoachAssigned: true, coachAssignmentStatuses: ['active'] }],
    ['revoked', { everCoachAssigned: true, coachAssignmentStatuses: ['revoked'] }],
    ['completed', { everCoachAssigned: true, coachAssignmentStatuses: ['completed'] }],
    ['revoked then completed', { everCoachAssigned: true, coachAssignmentStatuses: ['revoked', 'completed'] }],
  ];

  for (const [label, facts] of shapes) {
    it(`is never eligible with a ${label} assignment`, () => {
      const result = decide(facts);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('ever_coach_assigned');
    });
  }
});

describe('rule 2 — a test account is never eligible', () => {
  it('refuses it', () => {
    const result = decide({ isTest: true });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('test_account');
  });
});

describe('rule 5 — a suppression stamp makes eligibility false, whatever else is true', () => {
  it('refuses an account that would otherwise pass every rule', () => {
    const result = decide({ trialArcSuppressedAt: '2026-09-07T10:00:00.000Z' });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('suppressed');
  });

  /**
   * The one-direction rule, as an assertion rather than a comment: clearing
   * the stamp cannot make an ineligible account eligible. Every one of these
   * fails some other rule too, and every one of them stays refused with that
   * other rule's reason whether the stamp is set or null.
   */
  it('clearing the stamp never turns the arc on for an account another rule refused', () => {
    const otherwiseRefused: Partial<RelationshipFacts>[] = [
      { isTest: true },
      { tier: 'monthly' },
      { source: 'manual' },
      { hasSubscription: false, tier: null, source: null },
      { everCoachAssigned: true, coachAssignmentStatuses: ['revoked'] },
      { accountCreatedAt: '2026-08-01T00:00:00.000Z' },
    ];
    for (const shape of otherwiseRefused) {
      expect(decide({ ...shape, trialArcSuppressedAt: null }).eligible, JSON.stringify(shape)).toBe(
        false
      );
      expect(
        decide({ ...shape, trialArcSuppressedAt: '2026-09-07T10:00:00.000Z' }).eligible,
        JSON.stringify(shape)
      ).toBe(false);
    }
  });
});

describe('rule 3 — the automatic free trial, and only that', () => {
  it('refuses an account with no membership record at all', () => {
    const result = decide({ hasSubscription: false, tier: null, source: null, status: null });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_subscription');
  });

  it('refuses a paid tier', () => {
    expect(decide({ tier: 'monthly' }).reason).toBe('not_on_trial');
    expect(decide({ tier: 'annual' }).reason).toBe('not_on_trial');
    expect(decide({ tier: 'program' }).reason).toBe('not_on_trial');
    expect(decide({ tier: 'none' }).reason).toBe('not_on_trial');
  });

  it('refuses a trial an administrator assigned by hand', () => {
    expect(decide({ source: 'manual' }).reason).toBe('trial_not_automatic');
    expect(decide({ source: 'billing' }).reason).toBe('trial_not_automatic');
  });
});

describe('rule 6 — the relationship derivation has to answer PROSPECT', () => {
  it('refuses a full access grant, which makes the account an app member', () => {
    const result = decide({ fullAccess: true });
    expect(result.eligible).toBe(false);
    expect(result.relationship).toBe('APP_ONLY_MEMBER');
    expect(result.reason).toBe('not_a_prospect');
  });
});

describe('it fails shut', () => {
  it('refuses when a read failed rather than assuming the missing fact was false', () => {
    expect(decide({ readFailed: true }).reason).toBe('facts_unavailable');
  });

  it('refuses when the account has no readable creation date', () => {
    expect(decide({ accountCreatedAt: null }).reason).toBe('facts_unavailable');
    expect(decide({ accountCreatedAt: 'whenever' }).reason).toBe('facts_unavailable');
  });
});

describe('relationship derivation', () => {
  it('an active assignment beats a paid tier: a paying client is still a coaching client', () => {
    const facts = eligibleFacts({
      activeCoachAssignment: true,
      everCoachAssigned: true,
      coachAssignmentStatuses: ['active'],
      tier: 'monthly',
    });
    expect(deriveRelationship(facts)).toBe('ACTIVE_COACHING_CLIENT');
  });

  it('an active assignment beats a full access grant too', () => {
    const facts = eligibleFacts({
      activeCoachAssignment: true,
      everCoachAssigned: true,
      coachAssignmentStatuses: ['active'],
      fullAccess: true,
    });
    expect(deriveRelationship(facts)).toBe('ACTIVE_COACHING_CLIENT');
  });

  it('a revoked assignment plus a trial tier is a prospect', () => {
    const facts = eligibleFacts({
      activeCoachAssignment: false,
      everCoachAssigned: true,
      coachAssignmentStatuses: ['revoked'],
      tier: 'trial',
    });
    expect(deriveRelationship(facts)).toBe('PROSPECT');
  });

  it('a completed assignment plus a trial tier is a prospect', () => {
    const facts = eligibleFacts({
      everCoachAssigned: true,
      coachAssignmentStatuses: ['completed'],
      tier: 'trial',
    });
    expect(deriveRelationship(facts)).toBe('PROSPECT');
  });

  it('a missing subscription row is a prospect, not an error', () => {
    const facts = eligibleFacts({ hasSubscription: false, tier: null, source: null, status: null });
    expect(deriveRelationship(facts)).toBe('PROSPECT');
    expect(describeRelationship({ type: 'PROSPECT', facts })).toBe('Prospect (no membership record)');
  });

  it('full access with no assignment is an app member', () => {
    const facts = eligibleFacts({ fullAccess: true, tier: 'trial' });
    expect(deriveRelationship(facts)).toBe('APP_ONLY_MEMBER');
  });

  it('each paid tier with no assignment is an app member', () => {
    for (const tier of ['monthly', 'annual', 'program'] as const) {
      expect(deriveRelationship(eligibleFacts({ tier }))).toBe('APP_ONLY_MEMBER');
    }
  });

  it('a trial tier with no assignment is a prospect', () => {
    expect(deriveRelationship(eligibleFacts({ tier: 'trial' }))).toBe('PROSPECT');
    expect(deriveRelationship(eligibleFacts({ tier: 'none' }))).toBe('PROSPECT');
  });
});
