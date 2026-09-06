/**
 * THE CHECK-IN HISTORY CHART (2026-09-06), and the one thing it must never
 * get wrong.
 *
 * A DAY WITH NO CHECK-IN IS A GAP, NOT A ZERO. Plotting fourteen rows side
 * by side draws a continuous line whether they are fourteen consecutive
 * days or fourteen days spread over two months, and a missing day silently
 * becomes a straight line between its neighbours. That line is a claim
 * about a day she said nothing on. Zero is worse: zero is a real answer to
 * some of these questions, so substituting it turns silence into a bad
 * day. So the axis is real calendar days, a day with no row carries null
 * everywhere, and each series is drawn as one path per unbroken run.
 *
 * The full day by day list is still reachable, because the chart replaced
 * the TOP of that card and not the card.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { CheckinHistoryChart } from '@/app/coach/clients/[id]/detail/CheckinHistoryChart';
import {
  CHECKIN_WINDOW_DAYS,
  SLEEP_BAND_HOURS,
  buildCheckinSeries,
  daysBetween,
  loggedDaysInWindow,
  seriesSegments,
} from '@/lib/coach-detail/checkinSeries';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

/** One real-shaped row. Only the columns this chart reads carry meaning. */
function checkin(
  localDate: string,
  values: Partial<Pick<DailyCheckin, 'mood_level' | 'energy_level' | 'stress_level' | 'sleep_duration'>>
): DailyCheckin {
  return {
    id: `checkin-${localDate}`,
    user_id: 'member-1',
    timezone: 'America/New_York',
    local_date: localDate,
    mood_level: values.mood_level ?? null,
    sleep_quality: null,
    sleep_duration: values.sleep_duration ?? null,
    energy_level: values.energy_level ?? null,
    stress_level: values.stress_level ?? null,
    water_cups: null,
    digestion_rating: null,
    pain_discomfort_level: null,
    movement_today: null,
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: null,
    actual_wake_time: null,
    night_waking_count: null,
    night_sweats: null,
    morning_soreness: null,
    bowel_movement_status: null,
    recorded_at: `${localDate}T12:00:00.000Z`,
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: `${localDate}T12:00:00.000Z`,
  } as DailyCheckin;
}

/**
 * Newest first, which is exactly how getClientCheckins returns rows and
 * how the list under the chart is handed them. Sep 3 is missing on purpose.
 */
const ROWS: DailyCheckin[] = [
  checkin('2026-09-05', { mood_level: 4, energy_level: 3, stress_level: 2, sleep_duration: '7-8h' }),
  checkin('2026-09-04', { mood_level: 3, energy_level: 3, stress_level: 3, sleep_duration: '6-7h' }),
  checkin('2026-09-02', { mood_level: 2, energy_level: 2, stress_level: 4, sleep_duration: '5-6h' }),
  checkin('2026-09-01', { mood_level: 3, energy_level: 4, stress_level: 2, sleep_duration: '8h+' }),
];

describe('the axis is calendar days, so a missed day is a real hole', () => {
  const points = buildCheckinSeries(ROWS);

  it('spans every day from the oldest row to the newest, oldest first', () => {
    expect(points.map((p) => p.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
  });

  it('the day she skipped is present, marked unlogged, and null on every series', () => {
    const skipped = points.find((p) => p.date === '2026-09-03')!;
    expect(skipped.logged).toBe(false);
    expect(skipped.mood).toBeNull();
    expect(skipped.energy).toBeNull();
    expect(skipped.stress).toBeNull();
    expect(skipped.sleepHours).toBeNull();
    expect(skipped.sleepBand).toBeNull();
  });

  it('the skipped day is never zero, because zero is a real answer', () => {
    const skipped = points.find((p) => p.date === '2026-09-03')!;
    expect(skipped.mood).not.toBe(0);
    expect(skipped.energy).not.toBe(0);
  });

  it('each series breaks into one run per side of the gap', () => {
    expect(seriesSegments(points, (p) => p.mood)).toEqual([
      [0, 1],
      [3, 4],
    ]);
    expect(seriesSegments(points, (p) => p.sleepHours)).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });

  it('an unbroken run of days is a single segment', () => {
    const unbroken = buildCheckinSeries([
      checkin('2026-09-02', { mood_level: 3 }),
      checkin('2026-09-01', { mood_level: 4 }),
    ]);
    expect(seriesSegments(unbroken, (p) => p.mood)).toEqual([[0, 1]]);
  });

  it('a lone logged day between two blanks keeps its own run, so it still draws a dot', () => {
    const lonely = buildCheckinSeries([
      checkin('2026-09-05', { mood_level: 3 }),
      checkin('2026-09-03', { mood_level: 4 }),
      checkin('2026-09-01', { mood_level: 5 }),
    ]);
    expect(seriesSegments(lonely, (p) => p.mood)).toEqual([[0], [2], [4]]);
  });

  it('a day she logged but left one question blank breaks only that one series', () => {
    const partial = buildCheckinSeries([
      checkin('2026-09-03', { mood_level: 3, energy_level: 4 }),
      checkin('2026-09-02', { mood_level: 2 }),
      checkin('2026-09-01', { mood_level: 4, energy_level: 3 }),
    ]);
    expect(seriesSegments(partial, (p) => p.mood)).toEqual([[0, 1, 2]]);
    expect(seriesSegments(partial, (p) => p.energy)).toEqual([[0], [2]]);
  });

  it('no rows at all is an empty series rather than a chart of nothing', () => {
    expect(buildCheckinSeries([])).toEqual([]);
  });
});

describe('sleep is drawn in hours, and labelled by the band she actually answered', () => {
  it('every band the app can store has a place on the hours axis', () => {
    expect(Object.keys(SLEEP_BAND_HOURS).sort()).toEqual(
      ['5-6h', '6-7h', '7-8h', '8h+', '<5h'].sort()
    );
  });

  it('a band is placed at the middle of the hours it names', () => {
    expect(SLEEP_BAND_HOURS['6-7h']).toBe(6.5);
    expect(SLEEP_BAND_HOURS['7-8h']).toBe(7.5);
  });

  it('the point carries the band, so the label never prints the drawing position', () => {
    const points = buildCheckinSeries(ROWS);
    const day = points.find((p) => p.date === '2026-09-05')!;
    expect(day.sleepBand).toBe('7-8h');
    expect(day.sleepHours).toBe(7.5);
  });
});

describe('counting logged days over a named window', () => {
  it('counts only days inside the window', () => {
    expect(loggedDaysInWindow(ROWS, '2026-09-05', 7)).toBe(4);
    expect(loggedDaysInWindow(ROWS, '2026-09-05', 3)).toBe(2);
  });

  it('a day after today cannot be counted', () => {
    expect(loggedDaysInWindow(ROWS, '2026-09-02', 7)).toBe(2);
  });

  it('the window the page prints is the window it counts', () => {
    expect(CHECKIN_WINDOW_DAYS).toBe(7);
    expect(source('app/coach/clients/[id]/detail/page.tsx')).toContain(
      'windowDays: CHECKIN_WINDOW_DAYS'
    );
  });

  it('calendar arithmetic is calendar arithmetic', () => {
    expect(daysBetween('2026-09-01', '2026-09-05')).toBe(4);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('what the chart actually renders', () => {
  const html = renderToStaticMarkup(<CheckinHistoryChart checkins={ROWS} />);

  it('draws two separated charts, because sleep is not on a 1 to 5 scale', () => {
    expect(html).toContain('Mood, Energy, Stress (1 to 5)');
    expect(html).toContain('Sleep (hours)');
  });

  it('carries a legend naming all four series', () => {
    for (const label of ['Mood', 'Energy', 'Stress', 'Sleep']) {
      expect(html).toContain(label);
    }
  });

  it('stress is dashed, so it never depends on telling two dark strokes apart', () => {
    expect(html).toContain('stroke-dasharray="4 3"');
  });

  it('draws each rating series as two paths, one per side of the gap', () => {
    // Three rating series, two runs each, plus sleep's two runs.
    const paths = html.match(/<path /g) ?? [];
    expect(paths).toHaveLength(8);
  });

  it('says out loud that the lines break rather than joining across the gap', () => {
    expect(html).toContain('1 day in this span has no check-in');
  });

  it('labels a sleep point with her band, never with the hours it was drawn at', () => {
    expect(html).toContain('Sleep, Sep 5: 7-8h');
    expect(html).not.toContain('Sleep, Sep 5: 7.5');
  });

  it('keeps the full day by day list reachable behind its own control', () => {
    expect(html).toContain('Show all days');
  });

  it('an account with no check-ins says so instead of drawing an empty chart', () => {
    expect(renderToStaticMarkup(<CheckinHistoryChart checkins={[]} />)).toContain(
      'No check-ins recorded yet.'
    );
  });
});

describe('this chart is the coach side only', () => {
  const CHART = source('app/coach/clients/[id]/detail/CheckinHistoryChart.tsx');

  it('lives inside the coach route and is imported by exactly one page', () => {
    expect(source('app/coach/clients/[id]/detail/page.tsx')).toContain('<CheckinHistoryChart');
  });

  it('nothing member-facing imports it', () => {
    for (const memberPage of [
      'app/dashboard/page.tsx',
      'app/progress/page.tsx',
      'app/case/page.tsx',
      'app/root-map/page.tsx',
    ]) {
      expect(source(memberPage)).not.toContain('CheckinHistoryChart');
    }
  });

  it('its colours are its own and are not reached for from the member status palette', () => {
    expect(CHART).not.toContain('STATUS_STYLES');
  });
});
