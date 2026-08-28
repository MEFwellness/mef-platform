/**
 * EVERY NUMBER SHE READS AGREES (A4, Build 2, 2026-08-27).
 *
 * The fault, live on production: Home said "You have 3 logged days so far"
 * under her Root Score, and three inches lower, in the same Daily Brief,
 * Root said "You've logged 4 check-ins with me so far, and I still have
 * every one of them." Today said 4. The coach's screen said 3. Every one
 * of those numbers was arithmetically correct. Not one of them said which
 * span it counted, and both used the words "so far".
 *
 * Two halves are asserted here, and both matter:
 *
 *   1. There is ONE count, from lib/member-counts/checkinCounts.ts, and
 *      every all-time surface reads it. Behavioural, against real
 *      Supabase, on a member with a deliberately awkward history: four
 *      logged days, one of them older than the evidence window.
 *   2. The windowed figure NAMES ITS WINDOW, and the all-time figure keeps
 *      "so far", so the two sentences can no longer be read as one number
 *      disagreeing with itself. Pure, on the copy functions themselves.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  countLoggedDays,
  getLoggedDayTotals,
  getMemberCheckinCounts,
} from '../lib/member-counts/checkinCounts';
import { computeDataFloor } from '../lib/member-interpretation/dataFloor';
import { dataFloorStatement } from '../lib/member-interpretation/copy';
import { EVIDENCE_WINDOW_DAYS } from '../lib/member-interpretation/config';
import { fetchTenureCallbackContext } from '../lib/memory-callback/data';
import { buildTenureCallback } from '../lib/memory-callback/copy';
import { recordedDaysLabel } from '../lib/progress/statWindow';
import { addDaysToLocalDate } from '../lib/feed/dateMath';

const memberId = TEST_USERS.memberTwo.id;

/**
 * The awkward history on purpose: three days inside the evidence window
 * and one outside it, which is exactly the shape that produced "3" and "4"
 * on the same screen.
 */
const TODAY = '2026-08-27';
const INSIDE = [TODAY, addDaysToLocalDate(TODAY, -3), addDaysToLocalDate(TODAY, -10)];
const OUTSIDE = [addDaysToLocalDate(TODAY, -(EVIDENCE_WINDOW_DAYS + 2))];
const ALL_DATES = [...INSIDE, ...OUTSIDE];

async function clearCheckins() {
  const service = serviceRoleClient();
  await service.from('daily_checkins').delete().eq('user_id', memberId);
}

async function seed(dates: string[]) {
  const service = serviceRoleClient();
  await clearCheckins();
  if (dates.length === 0) return;
  const { error } = await service.from('daily_checkins').insert(
    dates.map((local_date) => ({
      user_id: memberId,
      local_date,
      timezone: 'America/New_York',
      recorded_at: `${local_date}T14:00:00.000Z`,
      sleep_quality: 3,
      energy_level: 3,
      stress_level: 3,
    }))
  );
  expect(error).toBeNull();
}

beforeAll(async () => {
  await seed(ALL_DATES);
});

afterAll(async () => {
  await clearCheckins();
});

describe('the one count, on a member whose oldest day is outside the window', () => {
  it('all time is four, and the window is three', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);
    const counts = await getMemberCheckinCounts(client, memberId, TODAY);

    expect(counts.allTimeLoggedDays).toBe(4);
    expect(counts.windowLoggedDays).toBe(3);
    expect(counts.windowDays).toBe(EVIDENCE_WINDOW_DAYS);
    expect(counts.firstLoggedLocalDate).toBe(OUTSIDE[0]);

    // Non-vacuous: the two numbers really are different here, which is the
    // whole condition the bug needed.
    expect(counts.allTimeLoggedDays).not.toBe(counts.windowLoggedDays);
  });

  it("Today's YOUR TOTALS and Root's own tenure line are the same number, from the same helper", async () => {
    const client = await signInAs(TEST_USERS.memberTwo);

    // Today's tile (getTotalCheckinCount delegates to exactly this).
    const totals = await getLoggedDayTotals(client, memberId);

    // Root's line in the Daily Brief and on the Case View.
    const tenure = await fetchTenureCallbackContext(client, memberId, TODAY);
    expect(tenure).not.toBeNull();
    expect(tenure!.totalCheckins).toBe(totals.allTimeLoggedDays);

    const sentence = buildTenureCallback(tenure)!;
    expect(sentence).toContain(`${totals.allTimeLoggedDays} check-ins`);
    expect(sentence).toContain('so far');
  });

  it('the windowed sentence Home shows names its window, and never says "so far"', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);
    const counts = await getMemberCheckinCounts(client, memberId, TODAY);
    const floor = computeDataFloor(counts.windowLoggedDays, counts.windowDays);

    expect(floor.loggedDays).toBe(3);
    expect(floor.windowDays).toBe(EVIDENCE_WINDOW_DAYS);
    expect(floor.met).toBe(false);
    expect(floor.statement).toContain(`3 days in the last ${EVIDENCE_WINDOW_DAYS} days`);
    expect(floor.statement).not.toContain('so far');
  });

  it('and the two sentences, side by side, cannot be read as one number contradicting itself', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);
    const counts = await getMemberCheckinCounts(client, memberId, TODAY);

    const homeSentence = computeDataFloor(counts.windowLoggedDays, counts.windowDays).statement;
    const rootSentence = buildTenureCallback(
      await fetchTenureCallbackContext(client, memberId, TODAY)
    )!;

    // One says which days it counted. The other says all of them.
    expect(homeSentence).toContain(`in the last ${EVIDENCE_WINDOW_DAYS} days`);
    expect(rootSentence).toContain('so far');
    expect(rootSentence).not.toContain(`last ${EVIDENCE_WINDOW_DAYS} days`);
  });
});

describe('a member with no history at all', () => {
  it('reads zero everywhere, and Root says nothing rather than nothing-shaped', async () => {
    await seed([]);
    const client = await signInAs(TEST_USERS.memberTwo);

    const counts = await getMemberCheckinCounts(client, memberId, TODAY);
    expect(counts.allTimeLoggedDays).toBe(0);
    expect(counts.windowLoggedDays).toBe(0);
    expect(counts.firstLoggedLocalDate).toBeNull();

    // No tenure to remember, so the callback declines rather than saying
    // "0 check-ins so far".
    expect(
      buildTenureCallback(await fetchTenureCallbackContext(client, memberId, TODAY))
    ).toBeNull();

    await seed(ALL_DATES);
  });
});

describe('a member with exactly one day', () => {
  it('reads one, in singular, on both figures', async () => {
    const theOneDay = addDaysToLocalDate(TODAY, -5);
    await seed([theOneDay]);
    const client = await signInAs(TEST_USERS.memberTwo);

    const counts = await getMemberCheckinCounts(client, memberId, TODAY);
    expect(counts.allTimeLoggedDays).toBe(1);
    expect(counts.windowLoggedDays).toBe(1);

    expect(computeDataFloor(1, EVIDENCE_WINDOW_DAYS).statement).toContain(
      `1 day in the last ${EVIDENCE_WINDOW_DAYS} days`
    );
    expect(buildTenureCallback(await fetchTenureCallbackContext(client, memberId, TODAY))).toBe(
      "You've logged your first check-in with me, and that's a real start."
    );

    await seed(ALL_DATES);
  });
});

describe('the count itself', () => {
  it('counts DAYS, not rows: two rows on one date are one day', () => {
    expect(
      countLoggedDays([
        { local_date: '2026-08-27' },
        { local_date: '2026-08-27' },
        { local_date: '2026-08-26' },
      ])
    ).toBe(2);
  });

  it('is zero for nothing', () => {
    expect(countLoggedDays([])).toBe(0);
  });
});

describe('the copy rules this build set', () => {
  it('the data floor sentence always names a window, whatever window it is given', () => {
    expect(dataFloorStatement(2, 7)).toContain('2 days in the last 7 days');
    expect(dataFloorStatement(1, 30)).toContain('1 day in the last 30 days');
  });

  it("Progress states the average's own denominator, never the size of the query window", () => {
    expect(recordedDaysLabel(4)).toBe('from 4 recorded days');
    expect(recordedDaysLabel(1)).toBe('from 1 recorded day');
    expect(recordedDaysLabel(4)).not.toContain('30');
  });

  it('no em dash reached any of these sentences', () => {
    const sentences = [
      dataFloorStatement(3, EVIDENCE_WINDOW_DAYS),
      recordedDaysLabel(4),
      buildTenureCallback({
        totalCheckins: 4,
        firstCheckinLocalDate: '2026-07-01',
        todayLocalDate: TODAY,
      })!,
    ];
    for (const sentence of sentences) expect(sentence).not.toContain('—');
  });
});
