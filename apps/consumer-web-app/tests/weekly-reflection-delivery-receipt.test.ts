/**
 * The Weekly Reflection's delivery receipt, and the sentence a coach reads
 * off it.
 *
 * THE BUG THIS FEATURE EXISTS TO END. A blank Weekly Reflection panel used
 * to mean two opposite things at once: she was shown it and chose not to
 * write, or she never opened the app. This file proves the four things
 * that have to be true for the new sentence to be worth believing:
 *
 *   1. THE RULES, pure. Which of the five states a week is in, and the one
 *      sentence each of them produces, in both tenses.
 *   2. ONCE PER WEEK, over a fake Postgres that actually enforces the
 *      unique constraint. Two showings in one week are one row with the
 *      FIRST timestamp, never two rows and never a moved timestamp.
 *   3. WHO MAY WRITE ONE, through the real action: not a member outside
 *      her window, not a member off the program tier, not a member who has
 *      already finished, and never anything the coach side runs.
 *   4. NO RECEIPT IS EVER AN ANALYTICS FIGURE.
 *
 * Timezone-safe throughout: every day name asserted here is asserted
 * against a member zone that is NOT the zone the instant is stored in, so
 * a helper that quietly formatted in UTC would fail rather than pass by
 * luck.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  DELIVERY_RECEIPTS_FIRST_WEEK,
  reflectionDayName,
  reflectionStatusLine,
  resolveReflectionDeliveryStatus,
} from '@/lib/weekly-reflection/delivery';
import {
  isReflectionWindowOpen,
  mostRecentReflectionWeekStart,
  reflectionWeekStartFor,
} from '@/lib/weekly-reflection/week';

const FRIDAY = '2026-09-04';
const SATURDAY = '2026-09-05';
const SUNDAY = '2026-09-06';
const MONDAY = '2026-09-07';
const WEDNESDAY = '2026-09-09';

/** A week whose window closed before receipts existed, so an absent row proves nothing. */
const PRE_BUILD_WEEK = '2026-08-21';

const NY = 'America/New_York';
const AUCKLAND = 'Pacific/Auckland';

// ---------------------------------------------------------------------
// 1. The rules
// ---------------------------------------------------------------------

describe('which week a coach is being told about', () => {
  it('inside the window, it is that window’s own Friday', () => {
    expect(mostRecentReflectionWeekStart(FRIDAY)).toBe(FRIDAY);
    expect(mostRecentReflectionWeekStart(SATURDAY)).toBe(FRIDAY);
    expect(mostRecentReflectionWeekStart(SUNDAY)).toBe(FRIDAY);
  });

  it('outside it, it is the weekend that most recently closed, on all four days', () => {
    expect(mostRecentReflectionWeekStart(MONDAY)).toBe(FRIDAY);
    expect(mostRecentReflectionWeekStart('2026-09-08')).toBe(FRIDAY);
    expect(mostRecentReflectionWeekStart(WEDNESDAY)).toBe(FRIDAY);
    expect(mostRecentReflectionWeekStart('2026-09-10')).toBe(FRIDAY);
  });

  it('never returns null, which is exactly how it differs from the availability answer', () => {
    expect(reflectionWeekStartFor(WEDNESDAY)).toBeNull();
    expect(mostRecentReflectionWeekStart(WEDNESDAY)).toBe(FRIDAY);
  });

  it('the window flag and the week are two separate answers a coach screen needs both of', () => {
    expect(isReflectionWindowOpen(SATURDAY)).toBe(true);
    expect(isReflectionWindowOpen(WEDNESDAY)).toBe(false);
  });
});

describe('the five states, decided from real facts only', () => {
  it('a completion outranks everything, receipt or no receipt', () => {
    expect(
      resolveReflectionDeliveryStatus({
        weekStart: FRIDAY,
        deliveredAt: null,
        completedAt: '2026-09-05T14:00:00.000Z',
      }).kind
    ).toBe('completed');
  });

  it('a receipt with no completion is delivered', () => {
    expect(
      resolveReflectionDeliveryStatus({
        weekStart: FRIDAY,
        deliveredAt: '2026-09-04T14:00:00.000Z',
        completedAt: null,
      }).kind
    ).toBe('delivered');
  });

  it('no receipt, in a week this system watched the whole of, is a real non-delivery', () => {
    expect(
      resolveReflectionDeliveryStatus({ weekStart: FRIDAY, deliveredAt: null, completedAt: null })
        .kind
    ).toBe('not_delivered');
  });

  it('no receipt, in a week that closed before receipts existed, is NO RECORD and never a non-delivery', () => {
    const status = resolveReflectionDeliveryStatus({
      weekStart: PRE_BUILD_WEEK,
      deliveredAt: null,
      completedAt: null,
    });
    expect(status.kind).toBe('no_record');
    expect(PRE_BUILD_WEEK < DELIVERY_RECEIPTS_FIRST_WEEK).toBe(true);
  });

  it('a receipt IS believed for a pre-build week, because a row could only come from a real display', () => {
    expect(
      resolveReflectionDeliveryStatus({
        weekStart: PRE_BUILD_WEEK,
        deliveredAt: '2026-08-21T14:00:00.000Z',
        completedAt: null,
      }).kind
    ).toBe('delivered');
  });

  it('a failed read is unreadable, not a non-delivery: an empty result is not evidence', () => {
    expect(
      resolveReflectionDeliveryStatus({
        weekStart: FRIDAY,
        deliveredAt: null,
        completedAt: null,
        readable: false,
      }).kind
    ).toBe('unreadable');
  });

  it('a completion with no timestamp is not announced as a day, it falls through to the receipt', () => {
    expect(
      resolveReflectionDeliveryStatus({
        weekStart: FRIDAY,
        deliveredAt: '2026-09-04T14:00:00.000Z',
        completedAt: null,
      }).kind
    ).toBe('delivered');
  });
});

// ---------------------------------------------------------------------
// The sentence
// ---------------------------------------------------------------------

function lineFor(
  input: { deliveredAt?: string | null; completedAt?: string | null; readable?: boolean },
  options: { weekStart?: string; windowOpen: boolean; timeZone?: string }
): string {
  const status = resolveReflectionDeliveryStatus({
    weekStart: options.weekStart ?? FRIDAY,
    deliveredAt: input.deliveredAt ?? null,
    completedAt: input.completedAt ?? null,
    readable: input.readable,
  });
  return reflectionStatusLine(status, {
    windowOpen: options.windowOpen,
    timeZone: options.timeZone ?? NY,
  });
}

describe('the status line inside her window', () => {
  it('says not delivered, and why, in the state the coach could not previously tell apart', () => {
    expect(lineFor({}, { windowOpen: true })).toBe(
      'Not delivered yet. They have not opened the app since Friday.'
    );
  });

  it('names the real day it was delivered, and says it is not finished', () => {
    expect(
      lineFor({ deliveredAt: '2026-09-04T18:30:00.000Z' }, { windowOpen: true })
    ).toBe('Delivered Friday. Not yet completed.');
  });

  it('names the real day it was completed', () => {
    expect(lineFor({ completedAt: '2026-09-05T18:30:00.000Z' }, { windowOpen: true })).toBe(
      'Completed Saturday.'
    );
  });

  it('says no record rather than implying she was never shown it', () => {
    const line = lineFor({}, { weekStart: PRE_BUILD_WEEK, windowOpen: true });
    expect(line).toBe('No delivery record for this week.');
    expect(line).not.toContain('Not delivered');
    expect(line).not.toContain('have not opened');
  });

  it('says the record could not be read, rather than inventing either answer', () => {
    expect(lineFor({ readable: false }, { windowOpen: true })).toBe(
      'The delivery record for this week could not be read.'
    );
  });
});

describe('the status line outside her window names the week it is about', () => {
  it('reports the weekend that closed, not today', () => {
    expect(lineFor({}, { windowOpen: false })).toBe(
      'Week of Sep 4: not delivered. They did not open the app that weekend.'
    );
  });

  it('delivered, past tense, with the week named', () => {
    expect(lineFor({ deliveredAt: '2026-09-04T18:30:00.000Z' }, { windowOpen: false })).toBe(
      'Week of Sep 4: delivered Friday, not completed.'
    );
  });

  it('completed, past tense, with the week named', () => {
    expect(lineFor({ completedAt: '2026-09-06T18:30:00.000Z' }, { windowOpen: false })).toBe(
      'Week of Sep 4: completed Sunday.'
    );
  });

  it('no record, past tense, with the week named', () => {
    expect(lineFor({}, { weekStart: PRE_BUILD_WEEK, windowOpen: false })).toBe(
      'Week of Aug 21: no delivery record.'
    );
  });
});

describe('the day names are HER day names, not the server’s and not the coach’s', () => {
  /**
   * 2026-09-05T01:00:00Z is Saturday in UTC, Friday evening in New York and
   * Saturday lunchtime in Auckland. A helper formatting in UTC would say
   * Saturday for both, so this is the assertion that a wrong zone cannot
   * pass by luck.
   */
  const LATE_FRIDAY_IN_NY = '2026-09-05T01:00:00.000Z';

  it('reads Friday for a New York member', () => {
    expect(reflectionDayName(LATE_FRIDAY_IN_NY, NY)).toBe('Friday');
    expect(lineFor({ deliveredAt: LATE_FRIDAY_IN_NY }, { windowOpen: true })).toBe(
      'Delivered Friday. Not yet completed.'
    );
  });

  it('reads Saturday for an Auckland member, from the same stored instant', () => {
    expect(reflectionDayName(LATE_FRIDAY_IN_NY, AUCKLAND)).toBe('Saturday');
    expect(
      lineFor({ deliveredAt: LATE_FRIDAY_IN_NY }, { windowOpen: true, timeZone: AUCKLAND })
    ).toBe('Delivered Saturday. Not yet completed.');
  });

  it('never prints Invalid Date, and never prints a raw ISO string', () => {
    expect(reflectionDayName('not a date', NY)).toBeNull();
    const line = lineFor({ deliveredAt: 'not a date' }, { windowOpen: true });
    expect(line).toBe('Delivered this week. Not yet completed.');
    expect(line).not.toContain('Invalid');
    expect(line).not.toContain('T00:00');
  });

  it('every sentence it can produce is free of em dashes and of ISO fragments', () => {
    const cases = [
      lineFor({}, { windowOpen: true }),
      lineFor({}, { windowOpen: false }),
      lineFor({ deliveredAt: '2026-09-04T18:30:00.000Z' }, { windowOpen: true }),
      lineFor({ deliveredAt: '2026-09-04T18:30:00.000Z' }, { windowOpen: false }),
      lineFor({ completedAt: '2026-09-05T18:30:00.000Z' }, { windowOpen: true }),
      lineFor({ completedAt: '2026-09-05T18:30:00.000Z' }, { windowOpen: false }),
      lineFor({}, { weekStart: PRE_BUILD_WEEK, windowOpen: true }),
      lineFor({}, { weekStart: PRE_BUILD_WEEK, windowOpen: false }),
      lineFor({ readable: false }, { windowOpen: true }),
      lineFor({ readable: false }, { windowOpen: false }),
    ];
    for (const line of cases) {
      expect(line).not.toContain('—');
      expect(line).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(line).not.toContain('date not available');
    }
  });
});

// ---------------------------------------------------------------------
// 2 and 3. The receipt itself, and who may write one
// ---------------------------------------------------------------------

type Receipt = { member_id: string; week_start: string; delivered_at: string; presentation: string };

type World = {
  tier: string;
  status: string;
  /** null means no reflection row, 'error' means the read failed. */
  reflectionRow: Record<string, unknown> | null | 'error';
  receipts: Receipt[];
  /** Every table an insert was attempted against, so a test can prove nothing else was written. */
  inserts: string[];
  signedIn: boolean;
  /** Her own local date, which is what the action resolves the week from. */
  localDate: string;
};

const MEMBER = 'member-1';

/**
 * Hoisted, because every vi.mock factory below is hoisted above the file
 * and would otherwise close over a variable that does not exist yet.
 */
const world = vi.hoisted<World>(() => ({
  tier: 'program',
  status: 'active',
  reflectionRow: null,
  receipts: [],
  inserts: [],
  signedIn: true,
  localDate: '2026-09-05',
}));

function resetWorld(): void {
  world.tier = 'program';
  world.status = 'active';
  world.reflectionRow = null;
  world.receipts = [];
  world.inserts = [];
  world.signedIn = true;
  world.localDate = SATURDAY;
}

/**
 * A fake PostgREST that honours the one constraint this feature leans on:
 * unique (member_id, week_start) on the receipts table. An insert that
 * would break it returns the same shape a real duplicate does, zero rows
 * and an error, so claimReflectionDelivery's read-back path is genuinely
 * exercised rather than assumed.
 */
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {};
      let inserted: Receipt | null = null;
      let insertFailed = false;

      builder.select = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      };

      builder.insert = (row: Record<string, unknown>) => {
        world.inserts.push(table);
        const candidate = row as unknown as Receipt;
        const clash = world.receipts.some(
          (r) => r.member_id === candidate.member_id && r.week_start === candidate.week_start
        );
        if (clash) {
          insertFailed = true;
        } else {
          world.receipts.push(candidate);
          inserted = candidate;
        }
        return builder;
      };

      builder.maybeSingle = async () => {
        if (inserted) return { data: inserted, error: null };
        if (insertFailed) return { data: null, error: { message: 'duplicate key value' } };

        if (table === 'member_access_facts') {
          return {
            data: {
              member_id: MEMBER,
              tier: world.tier,
              source: 'manual',
              status: world.status,
              full_access: false,
              trial_started_at: null,
              trial_ends_at: null,
              is_test: false,
            },
            error: null,
          };
        }
        if (table === 'member_weekly_reflections') {
          if (world.reflectionRow === 'error') return { data: null, error: { message: 'boom' } };
          return { data: world.reflectionRow, error: null };
        }
        if (table === 'member_weekly_reflection_deliveries') {
          const found =
            world.receipts.find(
              (r) => r.member_id === filters.member_id && r.week_start === filters.week_start
            ) ?? null;
          return { data: found, error: null };
        }
        return { data: null, error: null };
      };

      return builder;
    },
  }),
}));

vi.mock('@/lib/supabase/currentUser', () => ({
  getCachedUser: async () => (world.signedIn ? { id: 'member-1' } : null),
}));

vi.mock('@/lib/time/memberToday', () => ({
  memberTimezone: async () => 'America/New_York',
  FALLBACK_TIMEZONE: 'America/New_York',
}));
vi.mock('@/lib/time/localDate', () => ({
  todaysLocalDate: () => world.localDate,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { trackWeeklyReflectionDeliveredAction } = await import('@/app/actions/weeklyReflection');

beforeEach(resetWorld);

/** The one row, or a failure that says so rather than a confusing undefined further down. */
function onlyReceipt(): Receipt {
  const row = world.receipts[0];
  if (!row) throw new Error('expected exactly one receipt, found none');
  return row;
}

describe('the receipt is written once, on a real display', () => {
  it('the first display writes exactly one row, for her own local Friday', async () => {
    await trackWeeklyReflectionDeliveredAction('popup');
    expect(world.receipts).toHaveLength(1);
    expect(onlyReceipt().week_start).toBe(FRIDAY);
    expect(onlyReceipt().member_id).toBe(MEMBER);
    expect(onlyReceipt().presentation).toBe('popup');
  });

  it('a second display in the same week writes nothing, and never moves the timestamp', async () => {
    await trackWeeklyReflectionDeliveredAction('popup');
    const first = onlyReceipt().delivered_at;

    // Home renders the pop-up and the persistent card in one pass.
    await trackWeeklyReflectionDeliveredAction('home_card');
    // She reopens the app the next day.
    world.localDate = SUNDAY;
    await trackWeeklyReflectionDeliveredAction('popup');

    expect(world.receipts).toHaveLength(1);
    expect(onlyReceipt().delivered_at).toBe(first);
    expect(onlyReceipt().presentation).toBe('popup');
  });

  it('the persistent Home card is a real delivery too, when it gets there first', async () => {
    await trackWeeklyReflectionDeliveredAction('home_card');
    expect(world.receipts).toHaveLength(1);
    expect(onlyReceipt().presentation).toBe('home_card');
  });

  it('it creates no reflection row and no draft: the receipt is its own record', async () => {
    await trackWeeklyReflectionDeliveredAction('popup');
    expect(world.inserts).toEqual(['member_weekly_reflection_deliveries']);
    expect(world.inserts).not.toContain('member_weekly_reflections');
  });
});

describe('the four reasons it writes nothing', () => {
  it('outside the Friday to Sunday window, nothing is written', async () => {
    world.localDate = WEDNESDAY;
    await trackWeeklyReflectionDeliveredAction('popup');
    expect(world.receipts).toHaveLength(0);
    expect(world.inserts).toHaveLength(0);
  });

  it('a member who is not on the program tier gets no receipt', async () => {
    world.tier = 'monthly';
    await trackWeeklyReflectionDeliveredAction('popup');
    expect(world.receipts).toHaveLength(0);
  });

  it('a lapsed program subscription gets no receipt', async () => {
    world.status = 'expired';
    await trackWeeklyReflectionDeliveredAction('popup');
    expect(world.receipts).toHaveLength(0);
  });

  it('a week she has already finished gets no receipt', async () => {
    world.reflectionRow = {
      id: 'r1',
      week_start: FRIDAY,
      questions_version: 1,
      recap: {},
      answers: {},
      completed_at: '2026-09-05T12:00:00.000Z',
      created_at: '2026-09-05T12:00:00.000Z',
    };
    await trackWeeklyReflectionDeliveredAction('popup');
    expect(world.receipts).toHaveLength(0);
  });

  it('a failed reflection read writes nothing rather than guessing', async () => {
    world.reflectionRow = 'error';
    await trackWeeklyReflectionDeliveredAction('popup');
    expect(world.receipts).toHaveLength(0);
  });

  it('nobody signed in, nothing written', async () => {
    world.signedIn = false;
    await trackWeeklyReflectionDeliveredAction('popup');
    expect(world.receipts).toHaveLength(0);
  });

  it('a presentation the browser made up is refused before anything is read', async () => {
    await trackWeeklyReflectionDeliveredAction('coach_panel');
    await trackWeeklyReflectionDeliveredAction('');
    await trackWeeklyReflectionDeliveredAction(null);
    expect(world.receipts).toHaveLength(0);
    expect(world.inserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// 4. The structural guards
// ---------------------------------------------------------------------

const APP_ROOT = join(__dirname, '..');

/**
 * Strips comments, so a header EXPLAINING the receipt is never mistaken
 * for a file that writes one. Every guard below reads code, not prose:
 * this file's own point is that the write lives in exactly one place, and
 * the places that explain it are supposed to say its name.
 */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('nothing writes a receipt from a render, and nothing coach-side writes one at all', () => {
  it('the only write is the tracked action, reached only from the beacon route', () => {
    const writers = walk(join(APP_ROOT, 'app'))
      .concat(walk(join(APP_ROOT, 'components')), walk(join(APP_ROOT, 'lib')))
      .filter((file) => codeOf(readFileSync(file, 'utf8')).includes('claimReflectionDelivery'));

    expect(writers.map((f) => f.replace(`${APP_ROOT}/`, '')).sort()).toEqual([
      'app/actions/weeklyReflection.ts',
      'lib/weekly-reflection/data.ts',
    ]);
  });

  it('no code under app/coach touches the receipt table or the claim', () => {
    for (const file of walk(join(APP_ROOT, 'app/coach'))) {
      const code = codeOf(readFileSync(file, 'utf8'));
      expect(code, file).not.toContain('claimReflectionDelivery');
      expect(code, file).not.toContain('member_weekly_reflection_deliveries');
    }
  });

  it('the tracker fires from a mounted effect, never from a render', () => {
    const code = codeOf(
      readFileSync(
        join(APP_ROOT, 'components/weekly-reflection/TrackWeeklyReflectionDelivered.tsx'),
        'utf8'
      )
    );
    expect(code).toContain("'use client'");
    expect(code).toContain('useEffect');
    expect(code).toContain('sendBeacon');
    // A Server Action call from an invisible tracker re-renders the whole
    // route, which is the thing the beacon exists to avoid.
    expect(code).not.toContain('trackWeeklyReflectionDeliveredAction');
  });

  it('no analytics figure counts a receipt', () => {
    const analyticsFiles = walk(join(APP_ROOT, 'lib/analytics')).concat(
      walk(join(APP_ROOT, 'lib/analytics-service'))
    );
    for (const file of analyticsFiles) {
      expect(codeOf(readFileSync(file, 'utf8')), file).not.toContain(
        'member_weekly_reflection_deliveries'
      );
    }
  });
});
