/**
 * "What needs attention", on ONE member's page.
 *
 * The bug this file exists for, found on a coach's screen 2026-08-30: a
 * member who had checked in the day before had five "No recent check-in"
 * alerts stacked on her page, one saying twelve days and four saying seven.
 * It read like another member's alerts leaking onto hers. It was not. Every
 * row was hers, and three separate faults put them there:
 *
 *   1. The engine recalculates on every coach page view and several panels
 *      call it at once, so four concurrent runs each read "no open alert
 *      with this key" before any of them had written one, and all four
 *      inserted. Nothing in the schema stopped them.
 *   2. Nothing ever closed an alert when its condition came right, so the
 *      row raised while she was away stayed open, with its day count frozen,
 *      after she came back.
 *   3. The coach's page read EVERY alert row ever written for her, resolved
 *      and dismissed included, so even a closed one still rendered.
 *
 * Each of the three is tested here against real local Supabase and real row
 * level security, plus the filter that has always been correct (one
 * member's alerts are one member's) so a future change cannot quietly drop
 * it.
 *
 * Fixture rows use their own alert keys, prefixed, and are deleted at the
 * end.
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  listCoachAlertsForMember,
  reconcileCoachAlerts,
  upsertCoachAlert,
} from '../lib/intelligence-engine/data';
import { buildCoachAlertDrafts } from '../lib/intelligence-engine/alerts';
import { NO_CHECKIN_ALERT_DAYS } from '../lib/intelligence-engine/thresholds';
import type { CoachAlertDraft, MemberHealthProfile } from '../lib/intelligence-engine/types';

const MEMBER = TEST_USERS.memberOne.id;
const OTHER_MEMBER = TEST_USERS.memberTwo.id;

/** This file's own keys, so no other suite's rows are read or removed. */
const KEY = 'fixture_attention_alert';
const OTHER_KEY = 'fixture_attention_alert_other';
const EVENT_KEY = 'coaching_direction_safety::fixture_attention';

function draft(overrides: Partial<CoachAlertDraft> = {}): CoachAlertDraft {
  return {
    alertType: 'no_checkin',
    severity: 'notable',
    title: 'No recent check-in',
    reason: "This member hasn't checked in for 12 days.",
    alertKey: KEY,
    evidenceRefs: [],
    sourceRefs: [],
    ...overrides,
  } as CoachAlertDraft;
}

function profile(overrides: Partial<MemberHealthProfile> = {}): MemberHealthProfile {
  return {
    memberId: MEMBER,
    localDate: '2026-08-30',
    wellnessInsights: [],
    registryEntries: [],
    openSafetyReviewCount: 0,
    daysSinceLastReassessmentOrBaseline: null,
    streak: {
      currentStreak: 0,
      longestStreak: 0,
      daysSinceLastCheckin: null,
      checkedInToday: false,
      justRecovered: false,
      isLongestInWindow: false,
    },
    adherence: { level: 'unknown', rate: null, sampleSize: 0 },
    ...overrides,
  } as MemberHealthProfile;
}

function noCheckinDrafts(daysSinceLastCheckin: number | null): CoachAlertDraft[] {
  const drafts = buildCoachAlertDrafts(
    profile({
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        daysSinceLastCheckin,
        checkedInToday: daysSinceLastCheckin === 0,
        justRecovered: false,
        isLongestInWindow: false,
      },
    } as Partial<MemberHealthProfile>),
    [],
    []
  );
  return drafts.filter((d) => d.alertType === 'no_checkin');
}

let service: SupabaseClient;
let coach: SupabaseClient;

beforeAll(async () => {
  service = serviceRoleClient();
  coach = await signInAs(TEST_USERS.coachOne);
});

async function clearFixtureAlerts(): Promise<void> {
  await service
    .from('intelligence_coach_alerts')
    .delete()
    .in('alert_key', [KEY, OTHER_KEY, EVENT_KEY])
    .in('member_id', [MEMBER, OTHER_MEMBER]);
}

afterAll(clearFixtureAlerts);

// ---------------------------------------------------------------------
// The rule itself
// ---------------------------------------------------------------------

describe('"No recent check-in" only ever speaks about a real gap', () => {
  it('a member who checked in yesterday is never told on', () => {
    expect(noCheckinDrafts(1)).toEqual([]);
  });

  it('a member who checked in today is never told on', () => {
    expect(noCheckinDrafts(0)).toEqual([]);
  });

  it('the last day inside the threshold is still silent', () => {
    expect(noCheckinDrafts(NO_CHECKIN_ALERT_DAYS - 1)).toEqual([]);
  });

  it('a real gap does raise it, and says how long the gap is', () => {
    const drafts = noCheckinDrafts(12);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.reason).toContain('12 days');
  });

  it('a member who has never checked in at all is not told she stopped', () => {
    expect(noCheckinDrafts(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// One member's page shows one member's alerts
// ---------------------------------------------------------------------

describe('the alerts on a member page are that member\'s', () => {
  beforeAll(async () => {
    await clearFixtureAlerts();
    await service.from('intelligence_coach_alerts').insert([
      {
        member_id: MEMBER,
        alert_type: 'no_checkin',
        severity: 'notable',
        title: 'No recent check-in',
        reason: 'Hers.',
        alert_key: KEY,
        status: 'open',
      },
      {
        member_id: OTHER_MEMBER,
        alert_type: 'no_checkin',
        severity: 'notable',
        title: 'No recent check-in',
        reason: 'Somebody else entirely.',
        alert_key: OTHER_KEY,
        status: 'open',
      },
    ]);
  });

  it('reads only the member asked for, never another member\'s row', async () => {
    const alerts = await listCoachAlertsForMember(coach, MEMBER);
    expect(alerts.every((alert) => alert.member_id === MEMBER)).toBe(true);
    expect(alerts.some((alert) => alert.alert_key === KEY)).toBe(true);
    expect(alerts.some((alert) => alert.alert_key === OTHER_KEY)).toBe(false);
  });

  it('a resolved alert is history and is left out of what needs attention', async () => {
    await service
      .from('intelligence_coach_alerts')
      .update({ status: 'resolved' })
      .eq('member_id', MEMBER)
      .eq('alert_key', KEY);

    const standing = await listCoachAlertsForMember(coach, MEMBER, {
      statusFilter: ['open', 'acknowledged'],
    });
    expect(standing.some((alert) => alert.alert_key === KEY)).toBe(false);

    // Still on file, so nothing has been destroyed by closing it.
    const everything = await listCoachAlertsForMember(coach, MEMBER);
    expect(everything.some((alert) => alert.alert_key === KEY)).toBe(true);
  });

  it('the coach page asks for open and acknowledged only, which is what left five closed alerts on one screen', () => {
    const source = readFileSync(
      path.resolve(__dirname, '..', 'app/actions/intelligence-engine.ts'),
      'utf-8'
    );
    const start = source.indexOf('export async function getClientCoachAlerts');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}', start));
    expect(body).toContain("statusFilter: ['open', 'acknowledged']");
  });
});

// ---------------------------------------------------------------------
// One open alert per key, however many runs race
// ---------------------------------------------------------------------

describe('the same alert cannot stack up on one member', () => {
  beforeAll(clearFixtureAlerts);

  it('four recalculations at once leave one open row, not four', async () => {
    await Promise.all(
      Array.from({ length: 4 }, () => upsertCoachAlert(service, MEMBER, draft()))
    );

    const { data } = await service
      .from('intelligence_coach_alerts')
      .select('id, reason')
      .eq('member_id', MEMBER)
      .eq('alert_key', KEY)
      .in('status', ['open', 'acknowledged']);

    expect(data).toHaveLength(1);
  });

  it('a later run rewrites the one row rather than adding another, so the number a coach reads is current', async () => {
    await upsertCoachAlert(service, MEMBER, draft({ reason: "This member hasn't checked in for 13 days." }));

    const { data } = await service
      .from('intelligence_coach_alerts')
      .select('reason')
      .eq('member_id', MEMBER)
      .eq('alert_key', KEY)
      .in('status', ['open', 'acknowledged']);

    expect(data).toHaveLength(1);
    expect(data![0]!.reason).toContain('13 days');
  });
});

// ---------------------------------------------------------------------
// An alert whose condition came right is closed
// ---------------------------------------------------------------------

describe('an alert stops standing when what raised it stops being true', () => {
  beforeAll(async () => {
    await clearFixtureAlerts();
    await service.from('intelligence_coach_alerts').insert([
      {
        member_id: MEMBER,
        alert_type: 'no_checkin',
        severity: 'notable',
        title: 'No recent check-in',
        reason: "This member hasn't checked in for 12 days.",
        alert_key: KEY,
        status: 'open',
        produced_by: 'intelligence_engine',
      },
      {
        member_id: MEMBER,
        alert_type: 'needs_review',
        severity: 'important',
        title: 'An unresolved check-in safety flag is open',
        reason: 'Raised as an event, not recomputed.',
        alert_key: EVENT_KEY,
        status: 'open',
        produced_by: 'coaching_direction',
      },
    ]);
  });

  it('a run that no longer raises it closes it, so she is not still flagged for a gap she has ended', async () => {
    await reconcileCoachAlerts(service, MEMBER, []);

    const { data } = await service
      .from('intelligence_coach_alerts')
      .select('status, resolution_note')
      .eq('member_id', MEMBER)
      .eq('alert_key', KEY)
      .single();

    expect(data!.status).toBe('resolved');
    expect(data!.resolution_note).toContain('no longer true');
  });

  it('another writer\'s alert is left alone, because nothing recomputes it', async () => {
    const { data } = await service
      .from('intelligence_coach_alerts')
      .select('status')
      .eq('member_id', MEMBER)
      .eq('alert_key', EVENT_KEY)
      .single();

    expect(data!.status).toBe('open');
  });

  it('an alert this run DID raise is left standing', async () => {
    await upsertCoachAlert(service, MEMBER, draft());
    await reconcileCoachAlerts(service, MEMBER, [KEY]);

    const { data } = await service
      .from('intelligence_coach_alerts')
      .select('status')
      .eq('member_id', MEMBER)
      .eq('alert_key', KEY)
      .in('status', ['open', 'acknowledged']);

    expect(data).toHaveLength(1);
  });

  it('closing it leaves it free to open again if she stops checking in later', async () => {
    await reconcileCoachAlerts(service, MEMBER, []);
    await upsertCoachAlert(service, MEMBER, draft());

    const { data } = await service
      .from('intelligence_coach_alerts')
      .select('status')
      .eq('member_id', MEMBER)
      .eq('alert_key', KEY)
      .in('status', ['open', 'acknowledged']);

    expect(data).toHaveLength(1);
  });

  it("a coach's own dismissal is never reopened by any of this", async () => {
    await service
      .from('intelligence_coach_alerts')
      .update({ status: 'dismissed' })
      .eq('member_id', MEMBER)
      .eq('alert_key', KEY)
      .in('status', ['open', 'acknowledged']);

    await upsertCoachAlert(service, MEMBER, draft());

    const { data } = await service
      .from('intelligence_coach_alerts')
      .select('status')
      .eq('member_id', MEMBER)
      .eq('alert_key', KEY)
      .in('status', ['open', 'acknowledged']);

    expect(data).toEqual([]);
  });
});
