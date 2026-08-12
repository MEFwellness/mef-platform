/**
 * The member engagement views: the access boundary, the toggle, and the
 * three reads the two screens make, proved against real local Supabase,
 * real row level security and the real database functions.
 *
 * The screens read exactly five things through
 * app/actions/analyticsAdmin.ts: the engagement states, the coach follow-up
 * shortlist (which is where the table's signal counts come from), one
 * member's friction signals, one member's activity timeline, and the
 * before/after comparison. Those actions cannot be called here (they use
 * cookies() from next/headers, which throws outside a Next.js request
 * scope), so these tests call the same service layer functions the actions
 * call, as the real seeded users. That is what actually proves the
 * boundary: the database's own guard, not a wrapper around it.
 *
 * The activity timeline is the one read in this section that touches rows
 * rather than a finished aggregate, so it gets the most attention here: that
 * it refuses a non-administrator before reading anything, that it groups by
 * the member's own calendar day, that it separates a start from a
 * completion, and that no health content can reach it even when health
 * content is deliberately written into the same event stream.
 *
 * The fixture window is deliberately separate from the two other analytics
 * fixtures so no file's cleanup can delete another's rows.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { anonClient, signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { getMemberEngagementStates } from '../lib/analytics-service/detections';
import { findMembersForCoachFollowUp } from '../lib/analytics-service/queries';
import { getMemberFrictionSignals } from '../lib/analytics-service/friction';
import { getMemberWindowComparison } from '../lib/analytics-service/comparison';
import { getMemberActivityTimeline } from '../lib/analytics-service/timeline';
import { AnalyticsAccessDeniedError } from '../lib/analytics-service/client';
import { analyticsOptionsFor, parseDashboardView } from '../lib/analytics-dashboard/viewState';
import {
  beforeAfterRows,
  countMembersByState,
  filterMembersByState,
  isInsufficientHistory,
  orderSignals,
  parseComparisonControls,
  signalPeriodLabel,
  sortMembersByAttention,
} from '../lib/analytics-dashboard/memberView';
import type { SupabaseClient } from '@supabase/supabase-js';

const TZ = 'America/New_York';
const ONE = TEST_USERS.memberOne.id;
const TWO = TEST_USERS.memberTwo.id;

/**
 * A fixture era of its own, well clear of both other analytics fixtures
 * (2026-01 and 2026-03). The reference date is fixed so every engagement
 * state and every window is deterministic.
 */
const WINDOW_START = '2025-09-01';
const WINDOW_END = '2025-10-30';
const REFERENCE = WINDOW_END;
const PERIOD = { start: WINDOW_START, end: WINDOW_END } as const;
const EMPTY_PERIOD = { start: '2025-11-05', end: '2025-11-15' } as const;

/**
 * Member One: a real rhythm, then a long gap, then repeated Daily Resets
 * she mostly did not finish. Enough history for the self-comparison path.
 */
const ONE_EARLY_DAYS = [
  '2025-09-02',
  '2025-09-04',
  '2025-09-06',
  '2025-09-08',
  '2025-09-10',
  '2025-09-12',
  '2025-09-14',
];
const ONE_LATE_DAYS = ['2025-10-27', '2025-10-28'];

/** Member Two: a single day of activity, far too little for any pattern claim. */
const TWO_DAYS = ['2025-10-29'];

function event(
  memberId: string,
  eventType: string,
  localDate: string,
  payload: Record<string, unknown> = {}
) {
  return {
    member_id: memberId,
    event_type: eventType,
    local_date: localDate,
    occurred_at: `${localDate}T14:00:00.000Z`,
    timezone: TZ,
    payload,
    source: 'member',
  };
}

function buildFixture() {
  const rows: ReturnType<typeof event>[] = [];

  for (const day of ONE_EARLY_DAYS) {
    rows.push(event(ONE, 'surface_viewed', day, { surface: 'home' }));
    rows.push(event(ONE, 'surface_viewed', day, { surface: 'today' }));
  }

  // Two days of Daily Resets: three started, one finished. That is the
  // repeated-incomplete-flow signal, and it is also what the timeline has to
  // separate into starts and completions.
  rows.push(event(ONE, 'daily_reset_started', '2025-10-27'));
  rows.push(event(ONE, 'daily_reset_started', '2025-10-28'));
  rows.push(event(ONE, 'daily_reset_started', '2025-10-28'));
  rows.push(event(ONE, 'daily_reset_completed', '2025-10-28'));
  for (const day of ONE_LATE_DAYS) {
    rows.push(event(ONE, 'surface_viewed', day, { surface: 'home' }));
  }

  // An event type the feature registry does not treat as a feature. It still
  // happened, and the timeline still has to show it.
  rows.push(event(ONE, 'session_started', '2025-10-27'));

  for (const day of TWO_DAYS) {
    rows.push(event(TWO, 'surface_viewed', day, { surface: 'home' }));
    rows.push(event(TWO, 'food_scan_performed', day, { source: 'camera' }));
  }

  // Real health content, written into the same event stream. Nothing in this
  // section may ever surface it. These are the pre-existing wellness event
  // types, which product_analytics_events excludes by construction.
  rows.push(
    event(ONE, 'concern_flagged', '2025-10-28', {
      painLocation: 'lower back',
      note: 'sharp pain when standing',
    })
  );
  rows.push(
    event(ONE, 'morning_readiness_recorded', '2025-10-28', { sleepQuality: 2, energyLevel: 1 })
  );

  return rows;
}

async function cleanup() {
  const service = serviceRoleClient();
  await service
    .from('member_wellness_events')
    .delete()
    .in('member_id', [ONE, TWO])
    .gte('local_date', WINDOW_START)
    .lte('local_date', EMPTY_PERIOD.end);
  await service.from('profiles').update({ is_test: false }).in('id', [ONE, TWO]);
}

let admin: SupabaseClient;
const OPTIONS = { period: PERIOD, today: REFERENCE } as const;

beforeAll(async () => {
  await cleanup();
  const service = serviceRoleClient();
  const { error } = await service.from('member_wellness_events').insert(buildFixture());
  if (error) throw new Error(`fixture insert failed: ${error.message}`);
  admin = await signInAs(TEST_USERS.adminOne);
});

afterAll(cleanup);

/** Exactly what the two member screens read. */
const MEMBER_READS: Array<[string, (client: SupabaseClient) => Promise<unknown>]> = [
  ['Engagement states', (client) => getMemberEngagementStates(client, OPTIONS)],
  [
    'Coach follow-up shortlist, the table signal counts',
    (client) => findMembersForCoachFollowUp(client, { ...OPTIONS, limit: 5 }),
  ],
  ['Friction signals', (client) => getMemberFrictionSignals(client, ONE, OPTIONS)],
  ['Activity timeline', (client) => getMemberActivityTimeline(client, ONE, OPTIONS)],
  [
    'Before and after',
    (client) => getMemberWindowComparison(client, ONE, '2025-10-15', { windowDays: 14 }),
  ],
];

// ---------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------

describe('who can read the member engagement views', () => {
  it('a platform administrator is admitted to all five reads', async () => {
    for (const [label, read] of MEMBER_READS) {
      const result = await read(admin);
      expect(result, `${label} must return a report to an administrator`).toBeTruthy();
    }
  });

  it('a signed-in member is refused by all five, and refused distinctly from being given nothing', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    for (const [label, read] of MEMBER_READS) {
      await expect(read(memberClient), `${label} must refuse a member`).rejects.toBeInstanceOf(
        AnalyticsAccessDeniedError
      );
    }
  });

  it('a signed-in coach is refused by all five: these are administrator screens', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    for (const [label, read] of MEMBER_READS) {
      await expect(read(coach), `${label} must refuse a coach`).rejects.toBeInstanceOf(
        AnalyticsAccessDeniedError
      );
    }
  });

  it('a signed-out visitor is refused by all five', async () => {
    for (const [label, read] of MEMBER_READS) {
      await expect(read(anonClient()), `${label} must refuse a visitor`).rejects.toBeInstanceOf(
        AnalyticsAccessDeniedError
      );
    }
  });

  it('the timeline refuses before it reads a single row, not after', async () => {
    // A member can read her own event rows through RLS all day. What must not
    // happen is this function returning her a timeline: the scope and
    // authorization check runs first and raises, so nothing is read at all.
    const memberClient = await signInAs(TEST_USERS.memberOne);
    await expect(getMemberActivityTimeline(memberClient, ONE, OPTIONS)).rejects.toBeInstanceOf(
      AnalyticsAccessDeniedError
    );
  });
});

// ---------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------

describe('the engagement table', () => {
  it('lists every in-scope member, including one who has never been active', async () => {
    const states = await getMemberEngagementStates(admin, OPTIONS);
    expect(states.length).toBeGreaterThanOrEqual(2);
    expect(states.map((s) => s.memberId)).toContain(ONE);
    expect(states.map((s) => s.memberId)).toContain(TWO);
    // Coaches and administrators are outside member scope by design.
    expect(states.map((s) => s.memberId)).not.toContain(TEST_USERS.coachOne.id);
    expect(states.map((s) => s.memberId)).not.toContain(TEST_USERS.adminOne.id);
  });

  it('sorts real states most in need of attention first, longest away first inside each', async () => {
    const sorted = sortMembersByAttention(await getMemberEngagementStates(admin, OPTIONS));
    const order = ['INACTIVE', 'WATCH', 'ACTIVE', 'NEW'];
    let last = -1;
    for (const member of sorted) {
      const rank = order.indexOf(member.state);
      expect(rank, `${member.memberId} is out of state order`).toBeGreaterThanOrEqual(last);
      last = rank;
    }
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      if (previous.state !== current.state) continue;
      const a = previous.facts.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER;
      const b = current.facts.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER;
      expect(a, `${previous.memberId} before ${current.memberId}`).toBeGreaterThanOrEqual(b);
    }
  });

  it('says how each state was decided, in the service layer own tokens', async () => {
    const states = await getMemberEngagementStates(admin, OPTIONS);
    for (const member of states) {
      expect(
        ['self_comparison', 'fixed_thresholds', 'new_member', 'never_active'],
        member.memberId
      ).toContain(member.basis);
      expect(member.reason.length, member.memberId).toBeGreaterThan(10);
    }
  });

  it('filters to one state and returns nothing rather than everybody when nobody is in it', async () => {
    const states = await getMemberEngagementStates(admin, OPTIONS);
    const counts = countMembersByState(states);
    for (const state of ['INACTIVE', 'WATCH', 'ACTIVE', 'NEW'] as const) {
      expect(filterMembersByState(states, state)).toHaveLength(counts[state]);
    }
    expect(counts.all).toBe(states.length);
  });

  it('moves the list from real members only to real plus test accounts and back', async () => {
    const service = serviceRoleClient();
    await service.from('profiles').update({ is_test: true }).eq('id', TWO);

    try {
      const off = parseDashboardView(
        { range: 'custom', from: WINDOW_START, to: WINDOW_END },
        REFERENCE
      );
      const on = parseDashboardView(
        { range: 'custom', from: WINDOW_START, to: WINDOW_END, test: 'on' },
        REFERENCE
      );

      const excluded = await getMemberEngagementStates(admin, {
        ...analyticsOptionsFor(off),
        today: REFERENCE,
      });
      const included = await getMemberEngagementStates(admin, {
        ...analyticsOptionsFor(on),
        today: REFERENCE,
      });

      expect(excluded.map((m) => m.memberId)).not.toContain(TWO);
      expect(included.map((m) => m.memberId)).toContain(TWO);
      expect(included.length).toBe(excluded.length + 1);
      expect(included.find((m) => m.memberId === TWO)!.facts.isTestAccount).toBe(true);

      // The same toggle reaches the per-member reads a row opens onto.
      const hidden = await getMemberActivityTimeline(admin, TWO, {
        ...analyticsOptionsFor(off),
        today: REFERENCE,
      });
      const shown = await getMemberActivityTimeline(admin, TWO, {
        ...analyticsOptionsFor(on),
        today: REFERENCE,
      });
      expect(hidden.inScope).toBe(false);
      expect(hidden.days).toHaveLength(0);
      expect(shown.inScope).toBe(true);
      expect(shown.days.length).toBeGreaterThan(0);
    } finally {
      await service.from('profiles').update({ is_test: false }).eq('id', TWO);
    }
  });

  it('counts friction signals only for the members the shortlist actually ran over', async () => {
    const states = await getMemberEngagementStates(admin, OPTIONS);
    const shortlist = await findMembersForCoachFollowUp(admin, { ...OPTIONS, limit: 50 });
    const counted = new Set(shortlist.map((c) => c.memberId));

    for (const candidate of shortlist) {
      expect(['INACTIVE', 'WATCH'], candidate.memberId).toContain(candidate.state);
      expect(Array.isArray(candidate.signalTypes)).toBe(true);
    }
    // An Active or New member is absent from the shortlist, which is why the
    // table says "Not counted" for her rather than printing a zero.
    for (const member of states.filter((m) => m.state === 'ACTIVE' || m.state === 'NEW')) {
      expect(counted.has(member.memberId), member.memberId).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
// Friction signals
// ---------------------------------------------------------------------

describe('one member friction signals', () => {
  it('raises a real signal from real behavior, with its evidence and its period', async () => {
    const report = await getMemberFrictionSignals(admin, ONE, OPTIONS);
    expect(report.memberId).toBe(ONE);
    expect(report.signals.length).toBeGreaterThan(0);

    for (const s of orderSignals(report.signals)) {
      expect(s.reason.length, s.type).toBeGreaterThan(10);
      expect(['low', 'moderate', 'strong'], s.type).toContain(s.evidenceSufficiency);
      expect(s.evidenceSufficiencyReason.length, s.type).toBeGreaterThan(10);
      const period = signalPeriodLabel(s, report.range);
      expect(period.label.length, s.type).toBeGreaterThan(3);
      expect(period.detail.length, s.type).toBeGreaterThan(3);
    }
  });

  it('says what happened and never why, in every signal it raised', async () => {
    const report = await getMemberFrictionSignals(admin, ONE, OPTIONS);
    const interpretive =
      /motivat|overwhelm|struggl|lazy|forgot|lost interest|does not care|discourag|frustrat|should |needs to|recommend/i;
    for (const s of report.signals) {
      expect(s.reason, s.type).not.toMatch(interpretive);
    }
  });

  it('carries no health content and no health field name, even though health rows exist for this member', async () => {
    const report = await getMemberFrictionSignals(admin, ONE, OPTIONS);
    const serialized = JSON.stringify(report);
    for (const forbidden of [
      'lower back',
      'sharp pain',
      'painLocation',
      'sleepQuality',
      'energyLevel',
      'concern_flagged',
      'morning_readiness_recorded',
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });

  it('returns exactly one insufficient-history signal, and no others, for a member with almost no history', async () => {
    const report = await getMemberFrictionSignals(admin, TWO, OPTIONS);
    expect(report.signals).toHaveLength(1);
    expect(isInsufficientHistory(report.signals[0]!)).toBe(true);
    expect(report.signals[0]!.evidenceSufficiency).toBe('low');
  });

  it('says an id that is not an in-scope member is not one, rather than inventing a member', async () => {
    const report = await getMemberFrictionSignals(
      admin,
      '00000000-0000-0000-0000-000000000000',
      OPTIONS
    );
    expect(report.signals).toHaveLength(1);
    expect(isInsufficientHistory(report.signals[0]!)).toBe(true);
    expect(report.signals[0]!.reason).toContain('No member record is in scope');
  });
});

// ---------------------------------------------------------------------
// The activity timeline
// ---------------------------------------------------------------------

describe('one member activity timeline', () => {
  it('groups her own calendar days, most recent first, with no empty days invented', async () => {
    const timeline = await getMemberActivityTimeline(admin, ONE, OPTIONS);
    expect(timeline.inScope).toBe(true);
    expect(timeline.days.length).toBe(timeline.activeDays);
    expect(timeline.days.every((day) => day.totalEvents > 0)).toBe(true);

    const dates = timeline.days.map((day) => day.localDate);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(dates).toContain('2025-10-28');
    expect(dates).toContain('2025-09-02');
    // Nothing happened on this day, so there is no row for it.
    expect(dates).not.toContain('2025-09-03');
  });

  it('names the features she used, from the same registry the feature usage screen reads', async () => {
    const timeline = await getMemberActivityTimeline(admin, ONE, OPTIONS);
    const labels = timeline.features.map((feature) => feature.label);
    expect(labels).toContain('Home');
    expect(labels).toContain('Today');
    expect(labels).toContain('Daily Reset wizard');
  });

  it('separates a start from a completion, and counts each from the real rows', async () => {
    const timeline = await getMemberActivityTimeline(admin, ONE, OPTIONS);
    const day = timeline.days.find((d) => d.localDate === '2025-10-28')!;
    // Two Daily Resets started that day and one completed.
    expect(day.started).toBe(2);
    expect(day.completed).toBe(1);

    const wholeRange = timeline.features.reduce(
      (totals, feature) => ({
        started: totals.started + feature.started,
        completed: totals.completed + feature.completed,
      }),
      { started: 0, completed: 0 }
    );
    expect(wholeRange.started).toBe(3);
    expect(wholeRange.completed).toBe(1);
  });

  it('keeps an event with no registry feature rather than dropping it from her week', async () => {
    const timeline = await getMemberActivityTimeline(admin, ONE, OPTIONS);
    const labels = timeline.features.map((feature) => feature.label);
    expect(labels).toContain('Session started');
  });

  it('counts a day total from rows, so an event matching two buckets is still one action', async () => {
    const timeline = await getMemberActivityTimeline(admin, ONE, OPTIONS);
    for (const day of timeline.days) {
      const bucketed = day.features.reduce((sum, feature) => sum + feature.events, 0);
      expect(bucketed, day.localDate).toBeGreaterThanOrEqual(day.totalEvents);
    }
    const total = timeline.days.reduce((sum, day) => sum + day.totalEvents, 0);
    expect(total).toBe(timeline.totalEvents);
  });

  it('never returns an event row, a payload or a timestamp finer than the calendar day', async () => {
    const timeline = await getMemberActivityTimeline(admin, ONE, OPTIONS);
    const serialized = JSON.stringify(timeline);
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('occurred_at');
    expect(serialized).not.toContain('T14:00:00');
  });

  it('carries no health content, even though health rows exist for this member in this window', async () => {
    const timeline = await getMemberActivityTimeline(admin, ONE, OPTIONS);
    const serialized = JSON.stringify(timeline);
    for (const forbidden of [
      'lower back',
      'sharp pain',
      'painLocation',
      'sleepQuality',
      'energyLevel',
      'concern_flagged',
      'morning_readiness_recorded',
      'Concern flagged',
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });

  it('is empty, not broken, over a window with nothing in it', async () => {
    const timeline = await getMemberActivityTimeline(admin, ONE, {
      period: EMPTY_PERIOD,
      today: EMPTY_PERIOD.end,
    });
    expect(timeline.inScope).toBe(true);
    expect(timeline.days).toHaveLength(0);
    expect(timeline.totalEvents).toBe(0);
    expect(timeline.truncated).toBe(false);
  });

  it('says an id that is not an in-scope member is not one, rather than showing an empty member', async () => {
    const timeline = await getMemberActivityTimeline(
      admin,
      '00000000-0000-0000-0000-000000000000',
      OPTIONS
    );
    expect(timeline.inScope).toBe(false);
    expect(timeline.displayName).toBeNull();
    expect(timeline.days).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Before and after
// ---------------------------------------------------------------------

describe('the before/after comparison on a member detail', () => {
  it('reads two real windows either side of a reference date that belongs to neither', async () => {
    const comparison = await getMemberWindowComparison(admin, ONE, '2025-09-15', {
      windowDays: 14,
    });
    expect(comparison.inScope).toBe(true);
    expect(comparison.referenceDate).toBe('2025-09-15');
    expect(comparison.before.window.end < '2025-09-15').toBe(true);
    expect(comparison.after.window.start > '2025-09-15').toBe(true);
    // Her rhythm was entirely before that date in this fixture.
    expect(comparison.before.activeDays).toBeGreaterThan(0);
    expect(comparison.after.activeDays).toBe(0);
  });

  it('turns the two windows into a readout with no fabricated percentage', async () => {
    const comparison = await getMemberWindowComparison(admin, ONE, '2025-09-15', {
      windowDays: 14,
    });
    const rows = beforeAfterRows(comparison);
    const activeDays = rows.find((row) => row.metric === 'activeDays')!;
    expect(activeDays.after).toBe('0');
    expect(activeDays.change).toBe('Down to none');

    const completion = rows.find((row) => row.metric === 'dailyResetCompletionRate')!;
    expect(completion.after).toBe('Not measured');
  });

  it('uses the default reference date the screen picks, one whole window before the end', async () => {
    const view = parseDashboardView(
      { range: 'custom', from: WINDOW_START, to: WINDOW_END },
      REFERENCE
    );
    const controls = parseComparisonControls(undefined, view);
    expect(controls.referenceDate).toBe('2025-10-16');
    const comparison = await getMemberWindowComparison(admin, ONE, controls.referenceDate, {
      windowDays: controls.windowDays,
    });
    expect(comparison.after.window.end).toBe(WINDOW_END);
  });

  it('says an id that is not an in-scope member is not one', async () => {
    const comparison = await getMemberWindowComparison(
      admin,
      '00000000-0000-0000-0000-000000000000',
      '2025-09-15',
      { windowDays: 14 }
    );
    expect(comparison.inScope).toBe(false);
  });
});
