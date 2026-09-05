/**
 * THE TEST RIG OVERRIDE, AND THE THREE RULES IT MUST NEVER SKIP.
 *
 * TRIAL_ARC_TEST_ACCOUNT_IDS exists so the arc could be driven and watched
 * on the real site while the launch date was still null for everybody else.
 * The arc is launched now, and the list stays, for the same reason: a rig
 * that predates the launch can still be driven without moving the date. It is
 * a list of account ids in a server environment variable, and the danger of
 * such a list is obvious: a wrong entry, a stale entry, or somebody adding
 * a client id to debug something. So the list is deliberately narrow, and
 * every assertion below is about what it CANNOT do.
 */

import { describe, expect, it } from 'vitest';
import {
  TRIAL_ARC_LAUNCH,
  TRIAL_ARC_TEST_ACCOUNTS_ENV,
  isTrialArcTestAccount,
  trialArcTestAccountIds,
} from '@/lib/trial-arc/config';
import { decideTrialArcEligibility } from '@/lib/trial-arc/eligibility';
import type { RelationshipFacts } from '@/lib/membership/relationship';

const RIG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/**
 * An account that FAILS rules 1, 2 and 3 in every way at once: it predates
 * any launch, it is a seeded test account, and it holds no subscription
 * row. Nothing but the override can make this eligible.
 */
function rigFacts(overrides: Partial<RelationshipFacts> = {}): RelationshipFacts {
  return {
    memberId: RIG,
    activeCoachAssignment: false,
    everCoachAssigned: false,
    coachAssignmentStatuses: [],
    hasSubscription: false,
    tier: null,
    source: null,
    status: null,
    fullAccess: false,
    isTest: true,
    accountCreatedAt: '2020-01-01T00:00:00.000Z',
    trialArcSuppressedAt: null,
    readFailed: false,
    ...overrides,
  };
}

const NOW = new Date('2026-09-10T12:00:00.000Z');

function decide(overrides: Partial<RelationshipFacts> = {}, testAccounts = RIG) {
  return decideTrialArcEligibility({
    facts: rigFacts(overrides),
    now: NOW,
    launch: null,
    testAccounts,
  });
}

describe('the list is empty unless somebody fills it in', () => {
  it('an unset variable is an empty set', () => {
    expect(trialArcTestAccountIds(undefined).size).toBe(0);
  });

  it('so are an empty string and a string of separators', () => {
    expect(trialArcTestAccountIds('').size).toBe(0);
    expect(trialArcTestAccountIds(' , ; \n ').size).toBe(0);
  });

  it('and nothing about an account can put it on the list by itself', () => {
    expect(isTrialArcTestAccount(RIG, undefined)).toBe(false);
    expect(isTrialArcTestAccount(RIG, '')).toBe(false);
  });

  it('reads a server-only variable, with no NEXT_PUBLIC_ prefix that would reach a browser', () => {
    expect(TRIAL_ARC_TEST_ACCOUNTS_ENV).toBe('TRIAL_ARC_TEST_ACCOUNT_IDS');
    expect(TRIAL_ARC_TEST_ACCOUNTS_ENV.startsWith('NEXT_PUBLIC_')).toBe(false);
  });
});

describe('parsing can only ever shorten the list, never widen it', () => {
  it('accepts comma, whitespace and newline separated ids', () => {
    const ids = trialArcTestAccountIds(`${RIG}, ${OTHER}\n`);
    expect(ids.has(RIG)).toBe(true);
    expect(ids.has(OTHER)).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('drops anything that is not a well formed UUID rather than trusting it', () => {
    const ids = trialArcTestAccountIds(`${RIG}, not-an-id, *, ' or 1=1 --, 12345`);
    expect([...ids]).toEqual([RIG]);
  });

  it('matches case insensitively, because one tool prints a UUID upper and another lower', () => {
    expect(isTrialArcTestAccount(RIG.toUpperCase(), RIG)).toBe(true);
    expect(isTrialArcTestAccount(RIG, RIG.toUpperCase())).toBe(true);
  });

  it('never matches an account that is not on the list', () => {
    expect(isTrialArcTestAccount(OTHER, RIG)).toBe(false);
  });
});

describe('what the override skips: rules 1, 2 and 3, and only those', () => {
  /**
   * The arc is launched now (prompt 7), so the list is no longer the only
   * way anything is eligible. It stays exactly as narrow: every assertion
   * below passes `launch: null` on purpose, so what is being proved is what
   * the list itself can and cannot do, independently of the shipped date.
   */
  it('the shipped launch is a date, and the list is unchanged by that', () => {
    expect(TRIAL_ARC_LAUNCH).toBe('2026-09-05T16:00:00Z');
  });

  it('the rig is eligible with no launch date, a test flag, and no subscription row at all', () => {
    const result = decide();
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('eligible');
  });

  it('an identical account NOT on the list is refused by rule 1, exactly as before', () => {
    const result = decideTrialArcEligibility({
      facts: rigFacts({ memberId: OTHER }),
      now: NOW,
      launch: null,
      testAccounts: RIG,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('launch_not_set');
  });

  it('and with an empty list, the rig itself is refused by rule 1 too', () => {
    const result = decide({}, '');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('launch_not_set');
  });

  it('a tier the arc would normally refuse does not stop the rig', () => {
    expect(decide({ hasSubscription: true, tier: 'trial', source: 'manual' }).eligible).toBe(true);
  });
});

describe('what the override CANNOT skip, and this is the whole safety of the list', () => {
  it('rule 4: an account that has ever been assigned a coach is still refused, in any status', () => {
    for (const status of ['active', 'revoked', 'completed']) {
      const result = decide({ everCoachAssigned: true, coachAssignmentStatuses: [status] });
      expect(result.eligible, status).toBe(false);
      expect(result.reason, status).toBe('ever_coach_assigned');
    }
  });

  it('rule 6: a live coaching client on the list is still refused', () => {
    const result = decide({
      activeCoachAssignment: true,
      everCoachAssigned: true,
      coachAssignmentStatuses: ['active'],
    });
    expect(result.eligible).toBe(false);
    // Rule 4 answers first, which is the intended order: it reaches further
    // back than rule 6 does, and both refuse.
    expect(result.reason).toBe('ever_coach_assigned');
    expect(result.relationship).toBe('ACTIVE_COACHING_CLIENT');
  });

  it('rule 6: a paying app member on the list is still refused', () => {
    const result = decide({ hasSubscription: true, tier: 'monthly', source: 'billing' });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('not_a_prospect');
    expect(result.relationship).toBe('APP_ONLY_MEMBER');
  });

  it('rule 5: a suppressed account on the list is still refused', () => {
    const result = decide({ trialArcSuppressedAt: '2026-09-01T00:00:00.000Z' });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('suppressed');
  });

  it('a failed read is still refused, so the rig never resolves towards sending on a guess', () => {
    const result = decide({ readFailed: true });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('facts_unavailable');
  });
});
