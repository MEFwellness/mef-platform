/**
 * Bug sweep finding B2 (2026-08-27): `re_entry_shown` was written on every
 * mount of the Priority Card tracker, so one real re-entry opening
 * produced a row per render, per page load. Measured on production: 42
 * rows for one member on one day, against the one that is true.
 *
 * The fix is not a bigger dedupe window. It is that the event now rides
 * the same atomic claim `priority_shown` already rides
 * (claimPriorityShown's conditional UPDATE on `shown_at is null`), so the
 * database decides how many times a day the event can happen, not a timer
 * in the browser.
 *
 * These tests drive the real server action against a fake claim that
 * behaves the way the real one does: the first caller for a member and
 * local date wins, every later caller loses, and tomorrow's row is a fresh
 * claim.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Event = { memberId: string; eventType: string; payload?: Record<string, unknown> };

const events: Event[] = [];
/** member_daily_priorities.shown_at, keyed by member and local date. */
const claimed = new Set<string>();
let localDate = '2026-08-27';
let hasCoachingDecision = true;

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { timezone: 'America/New_York' } }) }),
      }),
    }),
  }),
}));

vi.mock('@/lib/supabase/currentUser', () => ({
  getCachedUser: async () => ({ id: 'member-1' }),
}));

vi.mock('@/app/actions/checkin', () => ({ resolveLocalDate: async () => localDate }));

vi.mock('@/lib/analytics/track', () => ({
  trackProductEvent: async (_c: unknown, event: Event) => {
    events.push(event);
  },
}));

vi.mock('@/lib/priority/data', () => ({
  // The real conditional UPDATE, in one line: the first caller for this
  // member and date wins, everyone after loses.
  claimPriorityShown: async (_c: unknown, memberId: string, date: string) => {
    const key = `${memberId}:${date}`;
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  },
  getDailyPriority: async () => null,
  setDailyPriorityStatus: async () => null,
}));

vi.mock('@/lib/coaching-direction/data', () => ({
  getCoachingDecision: async () =>
    hasCoachingDecision ? { rule: 're_entry', actionType: 'reconnect' } : null,
}));
vi.mock('@/lib/coaching-direction/service', () => ({ recordCardResponse: async () => {} }));
vi.mock('@/lib/reset-plan/data', () => ({
  getCurrentResetPlan: async () => null,
  getLatestResetPlanVersionId: async () => null,
  upsertResetPlanDailyLog: async () => {},
}));

const { trackPriorityShownAction } = await import('../app/actions/priority');

function countOf(eventType: string): number {
  return events.filter((e) => e.eventType === eventType).length;
}

beforeEach(() => {
  events.length = 0;
  claimed.clear();
  localDate = '2026-08-27';
  hasCoachingDecision = true;
});

describe('one real showing writes one row of each event', () => {
  it('a single showing writes exactly one re_entry_shown', async () => {
    await trackPriorityShownAction('re_entry', 'popup', true);
    expect(countOf('re_entry_shown')).toBe(1);
    expect(countOf('priority_shown')).toBe(1);
    expect(countOf('coaching_action_delivered')).toBe(1);
  });

  it('the three renders of one day (pop-up, Home inline, Today inline) still write one each', async () => {
    // This is the real production shape: Home renders the pop-up and the
    // inline card in the same pass, and Today renders it again later.
    await trackPriorityShownAction('re_entry', 'popup', true);
    await trackPriorityShownAction('re_entry', 'inline', true);
    await trackPriorityShownAction('re_entry', 'inline', true);

    expect(countOf('re_entry_shown')).toBe(1);
    expect(countOf('priority_shown')).toBe(1);
  });

  it('survives a React double-effect remount: two immediate calls, one row', async () => {
    await Promise.all([
      trackPriorityShownAction('re_entry', 'popup', true),
      trackPriorityShownAction('re_entry', 'popup', true),
    ]);
    expect(countOf('re_entry_shown')).toBe(1);
  });

  it('survives a double-tap reload: twenty calls across the day, one row', async () => {
    for (let i = 0; i < 20; i += 1) {
      await trackPriorityShownAction('re_entry', i % 2 ? 'inline' : 'popup', true);
    }
    expect(countOf('re_entry_shown')).toBe(1);
    expect(countOf('priority_shown')).toBe(1);
    expect(countOf('coaching_action_delivered')).toBe(1);
  });

  it('the presentation recorded is whichever one genuinely reached her first', async () => {
    await trackPriorityShownAction('re_entry', 'popup', true);
    await trackPriorityShownAction('re_entry', 'inline', true);
    const shown = events.find((e) => e.eventType === 'priority_shown');
    expect(shown?.payload).toEqual({ rule: 're_entry', presentation: 'popup' });
  });

  it('tomorrow is a new claim, so the event happens again', async () => {
    await trackPriorityShownAction('re_entry', 'popup', true);
    expect(countOf('re_entry_shown')).toBe(1);

    localDate = '2026-08-28';
    await trackPriorityShownAction('re_entry', 'popup', true);
    expect(countOf('re_entry_shown')).toBe(2);
  });
});

describe('re_entry_shown says what it says', () => {
  it('is not written when she is not in the re-entry state', async () => {
    await trackPriorityShownAction('todays_focus', 'inline', false);
    expect(countOf('re_entry_shown')).toBe(0);
    expect(countOf('priority_shown')).toBe(1);
  });

  it('IS written when the safety override outranks re-entry, because the re-entry state still fired', async () => {
    // lib/priority/select.ts puts safety above re_entry, so a member can
    // be in the re-entry state and still be shown a safety card. The event
    // counts the state, not the winning rule, which is why the action
    // takes isReEntry rather than reading rule === 're_entry'.
    await trackPriorityShownAction('safety', 'popup', true);
    expect(countOf('re_entry_shown')).toBe(1);
    const shown = events.find((e) => e.eventType === 'priority_shown');
    expect(shown?.payload).toEqual({ rule: 'safety', presentation: 'popup' });
  });

  it('carries no payload, so it can never leak health content', async () => {
    await trackPriorityShownAction('re_entry', 'popup', true);
    const reEntry = events.find((e) => e.eventType === 're_entry_shown');
    expect(reEntry?.payload).toBeUndefined();
  });

  it('a rule the browser made up is rejected before anything is written', async () => {
    await trackPriorityShownAction('made_up_rule', 'popup', true);
    expect(events).toHaveLength(0);
  });

  it('a presentation the browser made up is rejected before anything is written', async () => {
    await trackPriorityShownAction('re_entry', 'billboard', true);
    expect(events).toHaveLength(0);
  });

  it('losing the claim writes nothing at all, not even the delivery event', async () => {
    await trackPriorityShownAction('re_entry', 'popup', true);
    events.length = 0;
    await trackPriorityShownAction('re_entry', 'popup', true);
    expect(events).toHaveLength(0);
  });
});

describe('there is only one call site, and it is the claimed one', () => {
  it('no unclaimed re_entry_shown emitter survives anywhere in the app', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.join(__dirname, '..');

    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next' || entry === 'tests') continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry)) {
          const source = readFileSync(full, 'utf8');
          if (source.includes("eventType: 're_entry_shown'")) hits.push(path.relative(root, full));
        }
      }
    };
    for (const dir of ['app', 'lib', 'components']) walk(path.join(root, dir));

    expect(hits).toEqual(['app/actions/priority.ts']);
  });

  it('the tracker component fires one action and passes the re-entry state to it', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const tracker = readFileSync(
      path.join(__dirname, '..', 'components/priority/TrackPriorityShown.tsx'),
      'utf8'
    );
    // Exactly one call, not merely at least one. The server claim would
    // absorb a duplicated client call, but a second call site is still a
    // second round trip on every render and the shape this bug came in.
    const calls = tracker.match(/trackPriorityShownAction\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(tracker).toContain('trackPriorityShownAction(rule, presentation, isReEntry)');
    expect(tracker).not.toContain('trackReEntryShownAction');
  });

  it('the event rides the claim: it is written after the claim is won, inside the same function', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const actions = readFileSync(path.join(__dirname, '..', 'app/actions/priority.ts'), 'utf8');
    const claimAt = actions.indexOf('const won = await claimPriorityShown');
    const bailAt = actions.indexOf('if (!won) return;');
    const eventAt = actions.indexOf("eventType: 're_entry_shown'");
    expect(claimAt).toBeGreaterThan(0);
    expect(bailAt).toBeGreaterThan(claimAt);
    expect(eventAt).toBeGreaterThan(bailAt);
  });
});
