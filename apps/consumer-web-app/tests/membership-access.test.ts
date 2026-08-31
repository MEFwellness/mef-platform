/**
 * Membership tiers and the 30 day trial, the pure half.
 *
 * Trial arithmetic, the lock decision, and the routing rule that puts the
 * lock in front of the member app. No database and no network here: the
 * database half of the same feature (the backfill, the trial stamp, the
 * protection on a manual assignment, the events) is
 * tests/membership-access-integration.test.ts, which proves the same claims
 * against a real Postgres with real row level security.
 *
 * Two of the cases below are properties rather than examples, and they are
 * the ones that matter most:
 *   - a manual assignment beats the lock in every combination of the other
 *     inputs, tested exhaustively rather than by picking three;
 *   - nothing this module returns can itself be redirected, so no loop is
 *     possible.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TRIAL_LENGTH_DAYS,
  decideMemberAccess,
  describeAccess,
  isTrialOpen,
  subscriptionFromRow,
  trialDaysRemaining,
  trialEndFor,
  trialLengthDaysOf,
} from '../lib/membership/access';
import { memberAccessRedirectFor, TRIAL_ENDED_PATH } from '../lib/membership/routing';
import { MEMBER_ONLY_PREFIXES, isMemberOnlyPath } from '../lib/auth/staffRouting';
import {
  ACCESS_SOURCES,
  ACCESS_STATUSES,
  ACCESS_TIERS,
  ACCESS_TIER_LABEL,
  isAccessSource,
  isAccessStatus,
  isAccessTier,
} from '../lib/membership/types';
import type { AccessSource, AccessStatus, AccessTier, MemberSubscription } from '../lib/membership/types';
import { PAYWALL_LOCK_REASONS, isPaywallLockReason, isPaywallFeature } from '../lib/analytics/surfaces';
import { TRIAL_ENDED_COPY, trialEndedHeading } from '../lib/membership/copy';
import { PRICING_LINK_PLACEHOLDER, getPricingUrl, isPricingUrlConfigured } from '../lib/membership/pricing';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-14T12:00:00.000Z');

function subscription(overrides: Partial<MemberSubscription> = {}): MemberSubscription {
  const started = new Date(NOW.getTime() - 5 * DAY_MS);
  return {
    memberId: 'member-1',
    tier: 'trial',
    source: 'system',
    status: 'active',
    fullAccess: false,
    trialStartedAt: started.toISOString(),
    trialEndsAt: trialEndFor(started).toISOString(),
    ...overrides,
  };
}

/** A trial that started long enough ago to be over. */
function expiredTrial(overrides: Partial<MemberSubscription> = {}): MemberSubscription {
  const started = new Date(NOW.getTime() - (TRIAL_LENGTH_DAYS + 3) * DAY_MS);
  return subscription({
    trialStartedAt: started.toISOString(),
    trialEndsAt: trialEndFor(started).toISOString(),
    ...overrides,
  });
}

describe('trial arithmetic', () => {
  it('a NEW trial is 7 days long', () => {
    expect(TRIAL_LENGTH_DAYS).toBe(7);
  });

  it('trialEndFor is exactly 7 days after the start', () => {
    const start = new Date('2026-01-01T09:30:00.000Z');
    expect(trialEndFor(start).toISOString()).toBe('2026-01-08T09:30:00.000Z');
  });

  it('trialEndFor keeps the time of day, so a trial ends at the moment of day it started', () => {
    const start = new Date('2026-03-05T23:59:00.000Z');
    const end = trialEndFor(start);
    expect(end.getTime() - start.getTime()).toBe(TRIAL_LENGTH_DAYS * DAY_MS);
  });

  it('the window is open right up to the final instant and shut on it', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = trialEndFor(start);
    expect(isTrialOpen(end, new Date(end.getTime() - 1))).toBe(true);
    expect(isTrialOpen(end, end)).toBe(false);
    expect(isTrialOpen(end, new Date(end.getTime() + 1))).toBe(false);
  });

  it('days remaining counts down whole days and never goes below zero', () => {
    const end = new Date('2026-02-01T00:00:00.000Z');
    expect(trialDaysRemaining(end, new Date('2026-01-01T00:00:00.000Z'))).toBe(31);
    expect(trialDaysRemaining(end, new Date('2026-01-30T12:00:00.000Z'))).toBe(1);
    expect(trialDaysRemaining(end, new Date('2026-01-31T12:00:00.000Z'))).toBe(0);
    expect(trialDaysRemaining(end, new Date('2026-03-01T00:00:00.000Z'))).toBe(0);
  });

  it('a member who signed up longer ago than the trial runs is past it', () => {
    const signedUp = new Date(NOW.getTime() - 45 * DAY_MS);
    expect(isTrialOpen(trialEndFor(signedUp), NOW)).toBe(false);
  });

  it('a member who signed up 6 days ago still has their trial, with a day left', () => {
    const signedUp = new Date(NOW.getTime() - 6 * DAY_MS);
    expect(isTrialOpen(trialEndFor(signedUp), NOW)).toBe(true);
    expect(trialDaysRemaining(trialEndFor(signedUp), NOW)).toBe(1);
  });
});

/**
 * The whole point of the 7 day change: it moves the clock forward for new
 * accounts and for nobody else. `trial_ends_at` is a stamped value, so an
 * account given 30 days keeps every one of them, and the app reads that
 * stored date rather than recomputing one from TRIAL_LENGTH_DAYS.
 */
describe('grandfathering: a stored trial window is never recomputed', () => {
  const LEGACY_TRIAL_LENGTH_DAYS = 30;

  it('a legacy 30 day window is still open on day 20, even though a new trial is only 7 days', () => {
    const started = new Date(NOW.getTime() - 20 * DAY_MS);
    const legacy = subscription({
      trialStartedAt: started.toISOString(),
      trialEndsAt: new Date(started.getTime() + LEGACY_TRIAL_LENGTH_DAYS * DAY_MS).toISOString(),
    });

    // Recomputing from the new constant would have shut her out 13 days ago.
    expect(isTrialOpen(trialEndFor(started), NOW)).toBe(false);

    const decision = decideMemberAccess({ subscription: legacy, isTest: false, now: NOW });
    expect(decision).toEqual({ allowed: true, reason: 'trial_active' });
    expect(trialDaysRemaining(new Date(legacy.trialEndsAt), NOW)).toBe(10);
  });

  it('the lock still falls on a legacy window, on its own original date and not a day earlier', () => {
    const started = new Date(NOW.getTime() - 30 * DAY_MS);
    const endsAt = new Date(started.getTime() + LEGACY_TRIAL_LENGTH_DAYS * DAY_MS);
    const legacy = subscription({
      trialStartedAt: started.toISOString(),
      trialEndsAt: endsAt.toISOString(),
    });

    const justBefore = new Date(endsAt.getTime() - 1);
    expect(
      decideMemberAccess({ subscription: legacy, isTest: false, now: justBefore })
    ).toEqual({ allowed: true, reason: 'trial_active' });

    expect(decideMemberAccess({ subscription: legacy, isTest: false, now: endsAt })).toEqual({
      allowed: false,
      reason: 'trial_expired',
    });
  });

  it('reads back how long a given account\'s trial actually ran, whichever era stamped it', () => {
    const started = new Date('2026-01-01T00:00:00.000Z');
    const legacyEnd = new Date(started.getTime() + LEGACY_TRIAL_LENGTH_DAYS * DAY_MS);
    expect(trialLengthDaysOf(started.toISOString(), legacyEnd.toISOString())).toBe(30);
    expect(trialLengthDaysOf(started.toISOString(), trialEndFor(started).toISOString())).toBe(7);
  });

  it('an unreadable or backwards window answers null rather than guessing', () => {
    expect(trialLengthDaysOf('not a date', '2026-01-08T00:00:00.000Z')).toBeNull();
    expect(trialLengthDaysOf('2026-01-08T00:00:00.000Z', 'not a date')).toBeNull();
    expect(trialLengthDaysOf('2026-01-08T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBeNull();
    expect(trialLengthDaysOf('2026-01-08T00:00:00.000Z', '2026-01-08T00:00:00.000Z')).toBeNull();
  });

  it('the migration that shortened the trial writes nothing, so it cannot have moved a stored date', () => {
    const migration = readFileSync(
      path.resolve(__dirname, '../../../supabase/migrations/00000000000198_trial_length_seven_days.sql'),
      'utf8'
    );
    expect(migration).toContain('select 7;');
    const statements = migration.toLowerCase();
    expect(statements).not.toContain('update member_subscriptions');
    expect(statements).not.toContain('update public.member_subscriptions');
    expect(statements).not.toContain('insert into member_subscriptions');
    expect(statements).not.toContain('delete from member_subscriptions');
  });

  it('nothing in the app recomputes a stored expiry from the trial length constant', () => {
    // trialEndFor answers "when would a trial starting now end". If it ever
    // appears on a screen or in a service, some member's stored date is
    // being second-guessed.
    for (const file of [
      'app/trial-ended/page.tsx',
      'app/actions/memberAccess.ts',
      'app/admin/access/page.tsx',
      'lib/membership/service.ts',
      'middleware.ts',
    ]) {
      const source = readFileSync(path.join(path.resolve(__dirname, '..'), file), 'utf8');
      expect(source).not.toContain('trialEndFor');
      expect(source).not.toContain('TRIAL_LENGTH_DAYS');
    }
  });
});

describe('the lock decision', () => {
  it('lets in an account with no subscription row at all', () => {
    const decision = decideMemberAccess({ subscription: null, isTest: false, now: NOW });
    expect(decision).toEqual({ allowed: true, reason: 'no_subscription' });
  });

  it('lets in a trial that is still running', () => {
    const decision = decideMemberAccess({ subscription: subscription(), isTest: false, now: NOW });
    expect(decision).toEqual({ allowed: true, reason: 'trial_active' });
  });

  it('shuts out a trial that is over', () => {
    const decision = decideMemberAccess({
      subscription: expiredTrial(),
      isTest: false,
      now: NOW,
    });
    expect(decision).toEqual({ allowed: false, reason: 'trial_expired' });
  });

  it.each(['monthly', 'annual', 'program'] as const)(
    'lets in an active %s tier even though the trial is long over',
    (tier) => {
      const decision = decideMemberAccess({
        subscription: expiredTrial({ tier, source: 'manual' }),
        isTest: false,
        now: NOW,
      });
      expect(decision).toEqual({ allowed: true, reason: 'active_tier' });
    }
  );

  it('lets in a full access grant even on the none tier with an expired status', () => {
    const decision = decideMemberAccess({
      subscription: expiredTrial({
        tier: 'none',
        status: 'expired',
        source: 'manual',
        fullAccess: true,
      }),
      isTest: false,
      now: NOW,
    });
    expect(decision).toEqual({ allowed: true, reason: 'full_access' });
  });

  it('shuts out the none tier even while the trial window is still open', () => {
    const decision = decideMemberAccess({
      subscription: subscription({ tier: 'none', status: 'expired', source: 'manual' }),
      isTest: false,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('tier_none');
  });

  it.each(['expired', 'canceled'] as const)(
    'shuts out a monthly tier whose status is %s',
    (status) => {
      const decision = decideMemberAccess({
        subscription: expiredTrial({ tier: 'monthly', status, source: 'billing' }),
        isTest: false,
        now: NOW,
      });
      expect(decision).toEqual({ allowed: false, reason: 'subscription_inactive' });
    }
  );

  it('treats manual and billing identically, tier by tier and status by status', () => {
    for (const tier of ACCESS_TIERS) {
      for (const status of ACCESS_STATUSES) {
        for (const fullAccess of [true, false]) {
          const manual = decideMemberAccess({
            subscription: expiredTrial({ tier, status, fullAccess, source: 'manual' }),
            isTest: false,
            now: NOW,
          });
          const billing = decideMemberAccess({
            subscription: expiredTrial({ tier, status, fullAccess, source: 'billing' }),
            isTest: false,
            now: NOW,
          });
          expect(billing).toEqual(manual);
        }
      }
    }
  });

  it('an unparseable trial end leaves the member with their app rather than locking them out', () => {
    const decision = decideMemberAccess({
      subscription: subscription({ trialEndsAt: 'not a date' }),
      isTest: false,
      now: NOW,
    });
    expect(decision.allowed).toBe(true);
  });

  it('describes every reason it can return, with no gaps', () => {
    for (const tier of ACCESS_TIERS) {
      for (const status of ACCESS_STATUSES) {
        for (const source of ACCESS_SOURCES) {
          for (const isTest of [true, false]) {
            const decision = decideMemberAccess({
              subscription: expiredTrial({ tier, status, source }),
              isTest,
              now: NOW,
            });
            expect(typeof describeAccess(decision)).toBe('string');
            expect(describeAccess(decision).length).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(describeAccess({ allowed: true, reason: 'no_subscription' })).toContain('open');
    expect(describeAccess({ allowed: false, reason: 'trial_expired' })).toContain('locked');
  });
});

describe('test accounts and the expiry lockout', () => {
  it('an untouched test account is never locked out by the trial clock', () => {
    const decision = decideMemberAccess({
      subscription: expiredTrial({ source: 'system' }),
      isTest: true,
      now: NOW,
    });
    expect(decision).toEqual({ allowed: true, reason: 'test_account' });
  });

  it('a real member in exactly the same state IS locked out', () => {
    const decision = decideMemberAccess({
      subscription: expiredTrial({ source: 'system' }),
      isTest: false,
      now: NOW,
    });
    expect(decision).toEqual({ allowed: false, reason: 'trial_expired' });
  });

  it('an administrator assignment overrules the test exemption, which is what makes the lock verifiable on a real account', () => {
    const decision = decideMemberAccess({
      subscription: expiredTrial({ source: 'manual' }),
      isTest: true,
      now: NOW,
    });
    expect(decision).toEqual({ allowed: false, reason: 'trial_expired' });
  });

  it('and an assignment can put a test account back, immediately', () => {
    expect(
      decideMemberAccess({
        subscription: expiredTrial({ source: 'manual', tier: 'monthly' }),
        isTest: true,
        now: NOW,
      }).allowed
    ).toBe(true);
    expect(
      decideMemberAccess({
        subscription: expiredTrial({ source: 'manual', fullAccess: true }),
        isTest: true,
        now: NOW,
      }).allowed
    ).toBe(true);
  });
});

describe('a manual assignment always beats the lock', () => {
  /**
   * A property, not a sample. For every tier, every status and both test
   * flags, a manual assignment that grants access does so no matter how far
   * past the trial the account is, and a manually granted full access is
   * never overruled by anything.
   */
  it('every manual grant of an access-granting tier opens the app, with the trial long over', () => {
    const cases: { tier: AccessTier; status: AccessStatus; source: AccessSource }[] = [];
    for (const tier of ['monthly', 'annual', 'program'] as const) {
      for (const source of ['manual', 'billing'] as const) {
        cases.push({ tier, status: 'active', source });
      }
    }
    expect(cases.length).toBeGreaterThan(0);
    for (const one of cases) {
      for (const isTest of [true, false]) {
        const decision = decideMemberAccess({
          subscription: expiredTrial(one),
          isTest,
          now: NOW,
        });
        expect(decision.allowed).toBe(true);
      }
    }
  });

  it('a manual full access grant opens the app in every single combination of the other inputs', () => {
    let checked = 0;
    for (const tier of ACCESS_TIERS) {
      for (const status of ACCESS_STATUSES) {
        for (const isTest of [true, false]) {
          const decision = decideMemberAccess({
            subscription: expiredTrial({ tier, status, source: 'manual', fullAccess: true }),
            isTest,
            now: NOW,
          });
          expect(decision).toEqual({ allowed: true, reason: 'full_access' });
          checked += 1;
        }
      }
    }
    expect(checked).toBe(ACCESS_TIERS.length * ACCESS_STATUSES.length * 2);
  });

  it('a manually extended trial reopens the app the instant the new end date is in the future', () => {
    const started = new Date(NOW.getTime() - 60 * DAY_MS);
    const extended = subscription({
      source: 'manual',
      trialStartedAt: started.toISOString(),
      trialEndsAt: new Date(NOW.getTime() + 1).toISOString(),
    });
    expect(decideMemberAccess({ subscription: extended, isTest: false, now: NOW }).allowed).toBe(
      true
    );
  });
});

describe('where the lock sits', () => {
  it('sends a locked member off every member surface to the trial ended screen', () => {
    for (const prefix of MEMBER_ONLY_PREFIXES) {
      expect(
        memberAccessRedirectFor({ hasUser: true, isStaff: false, allowed: false, path: prefix })
      ).toBe(TRIAL_ENDED_PATH);
      expect(
        memberAccessRedirectFor({
          hasUser: true,
          isStaff: false,
          allowed: false,
          path: `${prefix}/anything/deeper`,
        })
      ).toBe(TRIAL_ENDED_PATH);
    }
  });

  it('leaves an allowed member entirely alone, on every one of the same paths', () => {
    for (const prefix of MEMBER_ONLY_PREFIXES) {
      expect(
        memberAccessRedirectFor({ hasUser: true, isStaff: false, allowed: true, path: prefix })
      ).toBeNull();
    }
  });

  it('never touches a signed out request, so it cannot interfere with the sign in redirect', () => {
    expect(
      memberAccessRedirectFor({ hasUser: false, isStaff: false, allowed: false, path: '/dashboard' })
    ).toBeNull();
  });

  it('never touches staff, so an administrator past their own trial is not sent to a member screen', () => {
    expect(
      memberAccessRedirectFor({ hasUser: true, isStaff: true, allowed: false, path: '/dashboard' })
    ).toBeNull();
  });

  it('leaves login, password reset, the change password screen and the API alone', () => {
    for (const path of [
      '/login',
      '/signup',
      '/verify',
      '/reset-password',
      '/reset-password/confirm',
      '/account/password',
      '/api/auth/callback',
      '/api/cron/wearable-daily',
      '/start',
      '/wellness-check',
    ]) {
      expect(
        memberAccessRedirectFor({ hasUser: true, isStaff: false, allowed: false, path })
      ).toBeNull();
    }
  });

  it('leaves the trial ended screen itself alone, so the redirect cannot loop', () => {
    expect(
      memberAccessRedirectFor({
        hasUser: true,
        isStaff: false,
        allowed: false,
        path: TRIAL_ENDED_PATH,
      })
    ).toBeNull();
    // The property, stated directly: whatever this function returns can
    // never itself be redirected again.
    const destination = memberAccessRedirectFor({
      hasUser: true,
      isStaff: false,
      allowed: false,
      path: '/dashboard',
    });
    expect(destination).not.toBeNull();
    expect(
      memberAccessRedirectFor({
        hasUser: true,
        isStaff: false,
        allowed: false,
        path: destination!,
      })
    ).toBeNull();
  });

  it('the trial ended screen is not itself a member-only path, or the staff rule would fight this one', () => {
    expect(isMemberOnlyPath(TRIAL_ENDED_PATH)).toBe(false);
  });
});

describe('vocabulary', () => {
  it('recognises exactly the five tiers, three sources and three statuses and nothing else', () => {
    expect([...ACCESS_TIERS].sort()).toEqual(['annual', 'monthly', 'none', 'program', 'trial']);
    expect([...ACCESS_SOURCES].sort()).toEqual(['billing', 'manual', 'system']);
    expect([...ACCESS_STATUSES].sort()).toEqual(['active', 'canceled', 'expired']);

    expect(isAccessTier('trial')).toBe(true);
    expect(isAccessTier('holistic_reset')).toBe(false);
    expect(isAccessSource('manual')).toBe(true);
    expect(isAccessSource('stripe')).toBe(false);
    expect(isAccessStatus('canceled')).toBe(true);
    expect(isAccessStatus('cancelled')).toBe(false);
  });

  it('names every tier for a screen', () => {
    for (const tier of ACCESS_TIERS) {
      expect(ACCESS_TIER_LABEL[tier].length).toBeGreaterThan(0);
    }
  });

  it('the trial tier names no number of days, because two windows are live at once', () => {
    // Accounts stamped before migration 198 hold 30 days and new ones hold
    // 7. One label cannot say both, and the card beside it already shows
    // that member's own start, end and days left.
    expect(ACCESS_TIER_LABEL.trial).toBe('Free trial');
    expect(ACCESS_TIER_LABEL.trial).not.toMatch(/\d/);
  });

  it('the database calls the trial tier the same thing the app does', () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        '../../../supabase/migrations/00000000000199_trial_tier_names_no_number.sql'
      ),
      'utf8'
    );
    expect(migration).toContain(`display_name = '${ACCESS_TIER_LABEL.trial}'`);
    expect(migration.toLowerCase()).not.toContain('update member_subscriptions');
  });

  it('normalises a database row into the shape the decision reads', () => {
    const built = subscriptionFromRow({
      member_id: 'abc',
      tier: 'annual',
      source: 'manual',
      status: 'active',
      full_access: true,
      trial_started_at: '2026-01-01T00:00:00.000Z',
      trial_ends_at: '2026-01-31T00:00:00.000Z',
    });
    expect(built).toEqual({
      memberId: 'abc',
      tier: 'annual',
      source: 'manual',
      status: 'active',
      fullAccess: true,
      trialStartedAt: '2026-01-01T00:00:00.000Z',
      trialEndsAt: '2026-01-31T00:00:00.000Z',
    });
  });
});

describe('analytics, reusing what already exists', () => {
  it('trial_expired is a lock REASON on the existing paywall_viewed event, not a new event type', () => {
    expect(PAYWALL_LOCK_REASONS).toContain('trial_expired');
    expect(isPaywallLockReason('trial_expired')).toBe(true);
  });

  it('keeps every lock reason the questionnaire gating already used, so nothing it emits stops validating', () => {
    for (const reason of [
      'membership',
      'not_assigned',
      'program_enrollment',
      'program_phase',
      'prerequisite',
      'free_tier_preview',
    ]) {
      expect(isPaywallLockReason(reason)).toBe(true);
    }
  });

  it('member_app is a valid paywall feature key', () => {
    expect(isPaywallFeature('member_app')).toBe(true);
  });
});

describe('the trial ended screen says the right thing', () => {
  const allCopy = [
    TRIAL_ENDED_COPY.eyebrow,
    TRIAL_ENDED_COPY.heading,
    ...TRIAL_ENDED_COPY.body,
    TRIAL_ENDED_COPY.primaryCta,
    TRIAL_ENDED_COPY.supportLead,
    TRIAL_ENDED_COPY.unconfiguredNote,
    TRIAL_ENDED_COPY.signedInAs,
    TRIAL_ENDED_COPY.dataNote,
  ];

  it('contains no em dash anywhere', () => {
    for (const line of allCopy) {
      expect(line).not.toContain('—');
    }
  });

  it('names no number of days on its own, so it cannot be wrong for either era of member', () => {
    expect(TRIAL_ENDED_COPY.heading).toBe('Your free trial is complete');
    expect(allCopy.join(' ')).not.toMatch(/\d+\s*days?/);
  });

  it('the heading names the days that member was actually given', () => {
    expect(trialEndedHeading(7)).toBe('Your 7 days are complete');
    expect(trialEndedHeading(30)).toBe('Your 30 days are complete');
    expect(trialEndedHeading(1)).toBe('Your first day is complete');
  });

  it('the heading names no number when the window cannot be read', () => {
    expect(trialEndedHeading(null)).toBe(TRIAL_ENDED_COPY.heading);
    expect(trialEndedHeading(0)).toBe(TRIAL_ENDED_COPY.heading);
    expect(trialEndedHeading(-3)).toBe(TRIAL_ENDED_COPY.heading);
  });

  it('the heading carries no em dash, whichever length it names', () => {
    for (const days of [null, 1, 7, 30]) {
      expect(trialEndedHeading(days)).not.toContain('\u2014');
    }
  });

  it('does not count anything down or warn about anything', () => {
    const joined = allCopy.join(' ').toLowerCase();
    for (const forbidden of ['warning', 'expired', 'lost', 'act now', 'hurry', 'last chance']) {
      expect(joined).not.toContain(forbidden);
    }
  });

  it('tells the member their data is still there', () => {
    expect(TRIAL_ENDED_COPY.dataNote.toLowerCase()).toContain('still');
    expect(TRIAL_ENDED_COPY.body.join(' ').toLowerCase()).toContain('stays yours');
  });

  it('offers a way to continue that is not a countdown', () => {
    expect(TRIAL_ENDED_COPY.primaryCta.toLowerCase()).toContain('continue');
  });
});

/**
 * The three things a runtime test in this repo cannot see: that the lock is
 * actually wired into middleware, that the screen renders what it claims,
 * and that the administrator's panel is reachable at all. Source scans, in
 * the same spirit as tests/role-based-home-routing.test.ts's third layer.
 */
describe('wiring', () => {
  const APP = path.resolve(__dirname, '..');
  const read = (relative: string) => readFileSync(path.join(APP, relative), 'utf8');

  it('middleware runs the lock, on the member-only route list, after the staff rule', () => {
    const source = read('middleware.ts');
    expect(source).toContain('memberAccessRedirectFor');
    expect(source).toContain('decideMemberAccess');
    expect(source).toContain('fetchMemberAccessFacts');
    // The entitlement read shares the one round trip the staff rule already
    // paid for, rather than adding a second.
    const block = source.slice(source.indexOf('isMemberOnlyPath(path)'));
    expect(block.indexOf('staffRedirectFor')).toBeLessThan(block.indexOf('memberAccessRedirectFor'));
  });

  it('the trial ended screen fires the existing paywall event with the trial_expired reason', () => {
    const source = read('app/trial-ended/page.tsx');
    expect(source).toContain('TrackPaywallView');
    expect(source).toContain('lockReason="trial_expired"');
    expect(source).toContain('feature="member_app"');
  });

  it('the trial ended screen links the configured pricing page and turns an allowed member away', () => {
    const source = read('app/trial-ended/page.tsx');
    expect(source).toContain('getPricingUrl');
    expect(source).toContain("redirect('/dashboard')");
  });

  it('the trial ended screen offers no member navigation, so it cannot bounce somebody straight back', () => {
    const source = read('app/trial-ended/page.tsx');
    expect(source).not.toContain('BottomNav');
  });

  it('the administrator panel exists, writes only through the guarded actions, and is linked from the admin home', () => {
    const panel = read('app/admin/access/MemberAccessPanel.tsx');
    expect(panel).toContain('setMemberAccessAction');
    expect(panel).toContain('expireMemberAccessAction');
    // Every control the brief asks for.
    expect(panel).toContain('Assign tier');
    expect(panel).toContain('full access');
    expect(panel).toContain('Extend trial');
    expect(panel).toContain('End access now');

    const adminHome = read('app/admin/page.tsx');
    expect(adminHome).toContain('/admin/access');
  });

  it('the actions reach the database only through the two administrator functions', () => {
    const actions = read('app/actions/memberAccess.ts');
    expect(actions).toContain('admin_set_member_access');
    expect(actions).toContain('admin_expire_member_access');
    expect(actions).toContain('admin_list_member_access');
    // No direct table write anywhere in the application, which is what
    // makes the database guard a real boundary rather than a suggestion.
    expect(actions).not.toContain("from('member_subscriptions')");
  });

  it('nothing in the app writes member_subscriptions directly', () => {
    for (const file of [
      'app/actions/memberAccess.ts',
      'lib/membership/service.ts',
      'lib/membership/access.ts',
      'middleware.ts',
    ]) {
      expect(read(file)).not.toContain(".update({ tier");
    }
  });

  it('added no new event type to the shared contract', () => {
    const events = readFileSync(
      path.resolve(APP, '../../packages/shared-types-contracts/src/events.types.ts'),
      'utf8'
    );
    expect(events).toContain("'membership_tier_changed'");
    expect(events).toContain("'paywall_viewed'");
    expect(events).not.toContain("'tier_changed'");
    expect(events).not.toContain("'trial_expired'");
  });
});

describe('the pricing link', () => {
  it('falls back to the flagged placeholder when nothing is configured', () => {
    const before = process.env.MEMBERSHIP_PRICING_URL;
    delete process.env.MEMBERSHIP_PRICING_URL;
    expect(getPricingUrl()).toBe(PRICING_LINK_PLACEHOLDER);
    expect(isPricingUrlConfigured()).toBe(false);
    if (before !== undefined) process.env.MEMBERSHIP_PRICING_URL = before;
  });

  it('uses the configured Leadpages pricing page once one is set, with no deploy needed', () => {
    const before = process.env.MEMBERSHIP_PRICING_URL;
    process.env.MEMBERSHIP_PRICING_URL = 'https://example-leadpages.net/pricing';
    expect(getPricingUrl()).toBe('https://example-leadpages.net/pricing');
    expect(isPricingUrlConfigured()).toBe(true);
    if (before === undefined) delete process.env.MEMBERSHIP_PRICING_URL;
    else process.env.MEMBERSHIP_PRICING_URL = before;
  });
});
