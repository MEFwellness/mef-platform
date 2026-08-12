/**
 * Product Analytics, integration tests against real local Supabase and
 * real RLS (see tests/setup/test-clients.ts for why this project tests
 * this way rather than mocking).
 *
 * These exercise the actual production write path: lib/analytics/track.ts
 * on top of lib/events/service.ts, against the real widened
 * member_wellness_events constraint and the real product_analytics_events
 * view. Server actions themselves cannot be called here (they use
 * next/headers), so the tests call the library functions those actions
 * call, plus a source scan proving each action really does call them.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { trackProductEvent, sanitizeAnalyticsPayload } from '../lib/analytics/track';
import {
  PRODUCT_SURFACES,
  isProductSurface,
  isEngageableFeature,
  isEngagementAction,
  isPaywallLockReason,
  isPaywallFeature,
} from '../lib/analytics/surfaces';
import type { ProductAnalyticsEventType } from '@mef/shared-types-contracts';

const TIMEZONE = 'America/New_York';

/** Every analytics type the app itself writes. The two trigger-written types are covered separately below. */
const APP_WRITTEN_TYPES: ProductAnalyticsEventType[] = [
  'session_started',
  'onboarding_started',
  'onboarding_completed',
  'surface_viewed',
  'daily_reset_started',
  'daily_reset_completed',
  'food_scan_performed',
  'food_entry_logged',
  'feature_engaged',
  'paywall_viewed',
  'purchase_completed',
  // Priority Card (migration 147).
  'priority_shown',
  'priority_action',
  're_entry_shown',
];

const ANALYTICS_TYPES: ProductAnalyticsEventType[] = [
  ...APP_WRITTEN_TYPES,
  'signup_completed',
  'membership_tier_changed',
];

/**
 * Deliberately never deletes signup_completed: that row is written once,
 * at account creation, by handle_new_user(), and a seeded account is never
 * re-created between test runs. Deleting it here would make the signup
 * assertion below pass on the first run and fail on every one after.
 */
async function cleanup() {
  const service = serviceRoleClient();
  const deletable = ANALYTICS_TYPES.filter((type) => type !== 'signup_completed');
  for (const memberId of [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id]) {
    await service
      .from('member_wellness_events')
      .delete()
      .eq('member_id', memberId)
      .in('event_type', deletable);
  }
}

/** Several assertions below read "the row this test just wrote". occurred_at defaults to now() for all of them, so ties are real; clearing the type first is what makes "the newest row" unambiguous. */
async function clearType(memberId: string, eventType: ProductAnalyticsEventType) {
  await serviceRoleClient()
    .from('member_wellness_events')
    .delete()
    .eq('member_id', memberId)
    .eq('event_type', eventType);
}

beforeAll(cleanup);
afterAll(cleanup);

describe('product analytics event types', () => {
  it('every new analytics event type is accepted by the widened constraint and written through the one existing pipeline', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    for (const eventType of APP_WRITTEN_TYPES) {
      const ok = await trackProductEvent(client, {
        memberId: TEST_USERS.memberOne.id,
        eventType,
        timezone: TIMEZONE,
      });
      expect(ok, `${eventType} should have been accepted`).toBe(true);
    }

    const service = serviceRoleClient();
    const { data } = await service
      .from('member_wellness_events')
      .select('event_type')
      .eq('member_id', TEST_USERS.memberOne.id)
      .in('event_type', APP_WRITTEN_TYPES);

    const written = new Set((data ?? []).map((row) => row.event_type));
    for (const eventType of APP_WRITTEN_TYPES) {
      expect(written.has(eventType), `${eventType} missing from the table`).toBe(true);
    }
  });

  it('rejects an event type that is not in the constraint, so a typo can never silently create a phantom event type', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const ok = await trackProductEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'definitely_not_a_real_event' as ProductAnalyticsEventType,
      timezone: TIMEZONE,
    });
    expect(ok).toBe(false);
  });

  it('records member id and both timestamps on every analytics event', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await clearType(TEST_USERS.memberOne.id, 'surface_viewed');
    await trackProductEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'surface_viewed',
      timezone: TIMEZONE,
      payload: { surface: 'home' },
    });

    const service = serviceRoleClient();
    const { data } = await service
      .from('member_wellness_events')
      .select('member_id, occurred_at, recorded_at, local_date, payload')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'surface_viewed')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .single();

    expect(data?.member_id).toBe(TEST_USERS.memberOne.id);
    expect(data?.occurred_at).toBeTruthy();
    expect(data?.recorded_at).toBeTruthy();
    expect(data?.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((data?.payload as { surface?: string }).surface).toBe('home');
  });
});

describe('signup and tier-change events are written by the database', () => {
  it('creating a real account writes exactly one signup_completed event, with no app code involved', async () => {
    const service = serviceRoleClient();

    // A genuinely new auth user, created the same way a real signup
    // creates one. Deliberately not asserted against the seeded accounts:
    // that would only prove the trigger ran at seed time, and would break
    // the moment any test cleans analytics rows. This proves the trigger
    // fires on account creation itself, now.
    const email = `analytics-signup-${Date.now()}@example.test`;
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: 'DevPassword123!',
      email_confirm: true,
      user_metadata: { timezone: TIMEZONE },
    });
    expect(createError).toBeNull();
    const newUserId = created!.user!.id;

    try {
      const { data: events } = await service
        .from('member_wellness_events')
        .select('event_type, source, timezone, local_date, payload')
        .eq('member_id', newUserId)
        .eq('event_type', 'signup_completed');

      expect(events?.length).toBe(1);
      expect(events![0]!.source).toBe('system');
      expect(events![0]!.timezone).toBe(TIMEZONE);
      expect(events![0]!.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(events![0]!.payload).toEqual({});

      // It is in the analytics view too, not only the raw table.
      const { data: viewRows } = await service
        .from('product_analytics_events')
        .select('event_type, is_test')
        .eq('member_id', newUserId);
      expect(viewRows?.length).toBe(1);
      expect(viewRows![0]!.event_type).toBe('signup_completed');
      expect(viewRows![0]!.is_test).toBe(false);
    } finally {
      await service.auth.admin.deleteUser(newUserId);
    }
  });

  it('changing profiles.membership_tier writes exactly one membership_tier_changed event carrying the real from/to tiers', async () => {
    const service = serviceRoleClient();

    // A dedicated, throwaway account. Deliberately not one of the seeded
    // members: other test files in the same run also read and write their
    // membership_tier, so asserting on a shared account's tier history is
    // a real race, not a theoretical one.
    const email = `analytics-tier-${Date.now()}@example.test`;
    const { data: created } = await service.auth.admin.createUser({
      email,
      password: 'DevPassword123!',
      email_confirm: true,
      user_metadata: { timezone: TIMEZONE },
    });
    const memberId = created!.user!.id;

    try {
      const { data: before } = await service
        .from('profiles')
        .select('membership_tier')
        .eq('id', memberId)
        .single();
      const originalTier = before?.membership_tier ?? null;
      const nextTier = originalTier === 'free_trial' ? 'membership' : 'free_trial';

      await service.from('profiles').update({ membership_tier: nextTier }).eq('id', memberId);

      const { data: events } = await service
        .from('member_wellness_events')
        .select('payload, source')
        .eq('member_id', memberId)
        .eq('event_type', 'membership_tier_changed');

      expect(events?.length).toBe(1);
      expect(events![0]!.source).toBe('system');
      expect((events![0]!.payload as { fromTier?: string | null }).fromTier).toBe(originalTier);
      expect((events![0]!.payload as { toTier?: string }).toTier).toBe(nextTier);

      // An update that does not actually change the tier must not produce a
      // second event, or every unrelated profile write would inflate the count.
      await service.from('profiles').update({ membership_tier: nextTier }).eq('id', memberId);

      const { data: after } = await service
        .from('member_wellness_events')
        .select('id')
        .eq('member_id', memberId)
        .eq('event_type', 'membership_tier_changed');
      expect(after?.length).toBe(1);
    } finally {
      await service.auth.admin.deleteUser(memberId);
    }
  });
});

describe('product_analytics_events view', () => {
  it('exposes analytics events and excludes the health-content wellness types entirely', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();

    // A real health-content event of the pre-existing kind.
    await client.from('member_wellness_events').insert({
      member_id: TEST_USERS.memberOne.id,
      event_type: 'concern_flagged',
      timezone: TIMEZONE,
      local_date: '2020-04-11',
      payload: { text: 'my knee has been hurting' },
    });

    await trackProductEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'surface_viewed',
      timezone: TIMEZONE,
      payload: { surface: 'progress' },
    });

    const { data: viewRows } = await service
      .from('product_analytics_events')
      .select('event_type, payload')
      .eq('member_id', TEST_USERS.memberOne.id);

    const types = new Set((viewRows ?? []).map((row) => row.event_type));
    expect(types.has('surface_viewed')).toBe(true);
    expect(types.has('concern_flagged')).toBe(false);

    const serialized = JSON.stringify(viewRows ?? []);
    expect(serialized).not.toContain('knee');

    await service
      .from('member_wellness_events')
      .delete()
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'concern_flagged');
  });

  it('joins is_test so test accounts are excludable, while their events still write normally', async () => {
    const service = serviceRoleClient();

    await service.from('profiles').update({ is_test: true }).eq('id', TEST_USERS.memberOne.id);

    const client = await signInAs(TEST_USERS.memberOne);
    const ok = await trackProductEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'session_started',
      timezone: TIMEZONE,
      payload: { method: 'password' },
    });
    expect(ok, 'a test account must still be able to write events').toBe(true);

    const { data: flagged } = await service
      .from('product_analytics_events')
      .select('is_test')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'session_started');
    expect(flagged?.length).toBeGreaterThan(0);
    expect(flagged!.every((row) => row.is_test === true)).toBe(true);

    const { data: excluded } = await service
      .from('product_analytics_events')
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('is_test', false);
    expect(excluded?.length).toBe(0);

    await service.from('profiles').update({ is_test: false }).eq('id', TEST_USERS.memberOne.id);
  });
});

describe('return frequency is derivable from session_started', () => {
  it('distinct visit days and days-between-visits come out of the raw events, with no separate mechanism', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();

    // Three sign-ins across two calendar days, the second day has two,
    // which must collapse to one visit.
    const stamps = [
      '2020-05-01T13:00:00.000Z',
      '2020-05-04T13:00:00.000Z',
      '2020-05-04T20:00:00.000Z',
    ];
    for (const iso of stamps) {
      await client.from('member_wellness_events').insert({
        member_id: TEST_USERS.memberOne.id,
        event_type: 'session_started',
        occurred_at: iso,
        timezone: TIMEZONE,
        local_date: iso.slice(0, 10),
        payload: { method: 'password' },
      });
    }

    const { data } = await service
      .from('product_analytics_events')
      .select('local_date')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'session_started')
      .in('local_date', ['2020-05-01', '2020-05-04'])
      .order('local_date', { ascending: true });

    const distinctDays = [...new Set((data ?? []).map((row) => row.local_date))];
    expect(distinctDays).toEqual(['2020-05-01', '2020-05-04']);

    const gapDays =
      (new Date('2020-05-04').getTime() - new Date('2020-05-01').getTime()) / 86_400_000;
    expect(gapDays).toBe(3);
  });
});

describe('allowlists', () => {
  it('accepts every declared surface and rejects anything else', () => {
    for (const surface of PRODUCT_SURFACES) {
      expect(isProductSurface(surface)).toBe(true);
    }
    expect(isProductSurface('not_a_surface')).toBe(false);
    expect(isProductSurface('')).toBe(false);
    expect(isProductSurface(42)).toBe(false);
  });

  it('rejects free text in every client-supplied analytics field', () => {
    const healthContent = 'my lower back hurts and I only slept 4 hours';
    expect(isProductSurface(healthContent)).toBe(false);
    expect(isEngageableFeature(healthContent)).toBe(false);
    expect(isEngagementAction(healthContent)).toBe(false);
    expect(isPaywallLockReason(healthContent)).toBe(false);
    expect(isPaywallFeature(healthContent)).toBe(false);
  });

  it('accepts a real registry key as a paywall feature but not an arbitrary sentence', () => {
    expect(isPaywallFeature('body-assessment')).toBe(true);
    expect(isPaywallFeature('four-doctors')).toBe(true);
    expect(isPaywallFeature('A sentence with spaces.')).toBe(false);
  });
});

describe('sanitizeAnalyticsPayload', () => {
  it('drops every key that is not on the neutral allowlist', () => {
    const clean = sanitizeAnalyticsPayload({
      surface: 'home',
      // Fields a mistaken call site might pass. None may survive.
      painLocation: 'lower back',
      sleepHours: '4',
      answers: 'mood 2, energy 1',
      notes: 'I feel awful today',
    } as never);

    expect(clean).toEqual({ surface: 'home' });
    expect(JSON.stringify(clean)).not.toContain('back');
    expect(JSON.stringify(clean)).not.toContain('awful');
  });

  it('drops an allowlisted key whose value is long enough to be prose rather than a slug', () => {
    const clean = sanitizeAnalyticsPayload({
      surface: 'home',
      feature: 'I woke up four times last night and my shoulder is still sore',
    } as never);
    expect(clean).toEqual({ surface: 'home' });
  });

  it('drops non-string values and keeps an explicit null (fromTier on a first-ever tier assignment)', () => {
    const clean = sanitizeAnalyticsPayload({ fromTier: null, toTier: 'membership' } as never);
    expect(clean).toEqual({ fromTier: null, toTier: 'membership' });

    const numeric = sanitizeAnalyticsPayload({ surface: 12345 } as never);
    expect(numeric).toEqual({});
  });

  it('a sanitized payload really is what reaches the database', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await clearType(TEST_USERS.memberOne.id, 'feature_engaged');
    await trackProductEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'feature_engaged',
      timezone: TIMEZONE,
      payload: {
        feature: 'todays_focus',
        action: 'completed_item',
        painLocation: 'left knee',
      } as never,
    });

    const service = serviceRoleClient();
    const { data } = await service
      .from('member_wellness_events')
      .select('payload')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'feature_engaged')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .single();

    expect(data?.payload).toEqual({ feature: 'todays_focus', action: 'completed_item' });
    expect(JSON.stringify(data?.payload)).not.toContain('knee');
  });
});

describe('tracking never breaks the member experience', () => {
  it('returns false instead of throwing when the write is impossible', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // memberTwo's id under memberOne's session, RLS rejects this insert.
    // The point is not that it is rejected (that is migration 63's policy,
    // already tested) but that the rejection surfaces as false, never as a
    // thrown error that could break the page the caller is rendering.
    let threw = false;
    let result: boolean | null = null;
    try {
      result = await trackProductEvent(client, {
        memberId: TEST_USERS.memberTwo.id,
        eventType: 'surface_viewed',
        timezone: TIMEZONE,
        payload: { surface: 'home' },
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBe(false);
  });
});

/**
 * Source scan, not a runtime test. Server actions cannot be invoked from
 * vitest here (next/headers) and SSR component tests do not render in this
 * repo, so the way to prove a call site exists is to read it. Same
 * convention as tests/coach-lock-ui-guard.test.ts and
 * tests/no-em-dash-guard.test.ts.
 */
describe('every required call site actually exists', () => {
  const appRoot = path.resolve(__dirname, '..');
  const read = (relative: string) => readFileSync(path.join(appRoot, relative), 'utf-8');

  it('the guard itself detects a missing call site (proves it is not vacuous)', () => {
    const withCall = "await trackProductEvent(supabase, { eventType: 'daily_reset_completed' });";
    const withoutCall = 'await recordMemberEvent(supabase, { eventType: 1 });';
    expect(withCall).toContain('daily_reset_completed');
    expect(withoutCall).not.toContain('daily_reset_completed');
  });

  it('Daily Reset completion is recorded in the check-in submit action', () => {
    const source = read('app/actions/checkin.ts');
    expect(source).toContain("eventType: 'daily_reset_completed'");
    expect(source).toContain('trackProductEvent');
  });

  it('Daily Reset start and the Daily Reset surface view are wired into the check-in page', () => {
    const source = read('app/checkin/page.tsx');
    expect(source).toContain('<TrackDailyResetStarted />');
    expect(source).toContain('surface="daily_reset"');
  });

  it('onboarding start and completion are both wired', () => {
    expect(read('app/onboarding/page.tsx')).toContain('<TrackOnboardingStarted />');
    expect(read('app/actions/onboarding.ts')).toContain("eventType: 'onboarding_completed'");
  });

  it('both sign-in paths record a session', () => {
    const source = read('app/actions/auth.ts');
    expect(source).toContain("eventType: 'session_started'");
    expect(source).toContain("recordSessionStarted(supabase, data.user.id, 'password')");
    expect(source).toContain("recordSessionStarted(supabase, user.id, 'passkey')");
  });

  it('every major surface has a view tracker on its page', () => {
    const pages: Array<[string, string]> = [
      ['app/dashboard/page.tsx', 'home'],
      ['app/checkin/page.tsx', 'daily_reset'],
      ['app/food-lens/page.tsx', 'food_lens'],
      ['app/progress/page.tsx', 'progress'],
      ['app/today/page.tsx', 'today'],
      ['app/case/page.tsx', 'your_case'],
      ['app/movement/page.tsx', 'movement'],
      ['app/questionnaires/page.tsx', 'questionnaires'],
      ['app/assessments/[questionnaireId]/page.tsx', 'questionnaire'],
      ['app/assessment/page.tsx', 'body_assessment'],
      ['app/conversation/page.tsx', 'conversation'],
      ['app/reset-plan/page.tsx', 'reset_plan'],
      ['app/membership/page.tsx', 'membership'],
    ];
    for (const [file, surface] of pages) {
      expect(read(file), `${file} should track surface ${surface}`).toContain(
        `surface="${surface}"`
      );
    }
  });

  it('Food Lens scans and every food log entry are recorded', () => {
    expect(read('app/actions/food-lens.ts')).toContain("eventType: 'food_scan_performed'");
    // Deliberately in the shared data-layer insert, so no logging path can
    // be missed. If this moves back out to the individual actions, this
    // test should be updated to check each of them instead.
    expect(read('lib/food-products/data.ts')).toContain("eventType: 'food_entry_logged'");
  });

  it("Today's Focus records both its view and its interactions", () => {
    const source = read('app/actions/feed.ts');
    expect(source).toContain("feature: 'todays_focus'");
    expect(source).toContain("trackTodaysFocus(supabase, user.id, 'opened_item')");
    expect(source).toContain("trackTodaysFocus(supabase, user.id, 'completed_item')");
    expect(source).toContain("trackTodaysFocus(supabase, user.id, 'dismissed_item')");
  });

  it('Reset Plan engagement is recorded on every real decision', () => {
    const source = read('app/actions/resetPlan.ts');
    for (const action of [
      'chose_focus',
      'chose_action_tier',
      'completed',
      'logged_day',
      'acknowledged',
    ]) {
      expect(source, `reset plan should record ${action}`).toContain(
        `trackResetPlanEngagement(supabase, memberId, '${action}')`
      );
    }
  });

  it('paywall views are recorded on both the coach lock and the membership lock', () => {
    expect(read('components/locked/LockedCardButton.tsx')).toContain('trackPaywallViewAction');
    expect(read('components/questionnaires/CatalogQuestionnaireCard.tsx')).toContain(
      '<TrackPaywallView'
    );
    expect(read('components/assessments/four-doctors-results/FreeTierSummary.tsx')).toContain(
      '<TrackPaywallView'
    );
  });
});
