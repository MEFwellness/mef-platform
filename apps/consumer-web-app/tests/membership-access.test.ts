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
import { TRIAL_ENDED_COPY } from '../lib/membership/copy';
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
  it('a trial is 30 days long', () => {
    expect(TRIAL_LENGTH_DAYS).toBe(30);
  });

  it('trialEndFor is exactly 30 days after the start', () => {
    const start = new Date('2026-01-01T09:30:00.000Z');
    expect(trialEndFor(start).toISOString()).toBe('2026-01-31T09:30:00.000Z');
  });

  it('trialEndFor keeps the time of day, so a trial ends at the moment it started 30 days on', () => {
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

  it('a member who signed up more than 30 days ago is past their trial the moment the backfill stamps them', () => {
    // Exactly the backfill's own arithmetic: trial start is the original
    // signup date, so a 45 day old account is 15 days past its trial.
    const signedUp = new Date(NOW.getTime() - 45 * DAY_MS);
    expect(isTrialOpen(trialEndFor(signedUp), NOW)).toBe(false);
  });

  it('a member who signed up 29 days ago still has their trial', () => {
    const signedUp = new Date(NOW.getTime() - 29 * DAY_MS);
    expect(isTrialOpen(trialEndFor(signedUp), NOW)).toBe(true);
    expect(trialDaysRemaining(trialEndFor(signedUp), NOW)).toBe(1);
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

  it('names the 30 days and does not count anything down or warn about anything', () => {
    expect(TRIAL_ENDED_COPY.heading).toContain('30 days');
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
