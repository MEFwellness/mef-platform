'use client';

/**
 * Cat's fortnight, as two small charts instead of fourteen lines of text.
 *
 * COACH SIDE ONLY. This file lives inside the coach's client detail route
 * and is imported by exactly one page. Nothing member-facing renders it,
 * and the colours below are this chart's own: the member's screens read
 * their status colours from lib/wellness/status.ts and are untouched.
 *
 * TWO CHARTS, NOT ONE, because sleep is not on the same scale as anything
 * else. Mood, Energy and Stress are all 1 to 5, so they share an axis and
 * can honestly be compared against each other. Sleep is hours, and drawing
 * it on a 1 to 5 axis would either squash it into nonsense or silently
 * rescale three real scales to fit a fourth. It gets its own strip
 * underneath, sharing the same days across the same width, so the two read
 * as one picture without pretending to one axis.
 *
 * A DAY WITH NO CHECK-IN IS A HOLE. Each line is drawn as one path per
 * unbroken run of logged days (lib/coach-detail/checkinSeries.ts), so a
 * missed day leaves a real gap. It is never plotted as zero, because zero
 * is a real answer to some of these questions and a missing day is not an
 * answer at all.
 */

import { useState } from 'react';
import {
  buildCheckinSeries,
  seriesSegments,
  type CheckinSeriesPoint,
} from '@/lib/coach-detail/checkinSeries';
import type { DailyCheckin } from '@mef/shared-types-contracts';

const MOOD_COLOR = '#1B3A2D'; // forest
const ENERGY_COLOR = '#B08900'; // warm gold, darkened enough to read on cream
const STRESS_COLOR = '#8A5A3B'; // clay, distinct from the gold without leaving the brand
const SLEEP_COLOR = '#3E5C46'; // the softer forest the page already uses for labels
const GRID_COLOR = 'rgba(27,58,45,0.10)';
const SURFACE_COLOR = '#FAFAF8';

const WIDTH = 320;
const RATING_HEIGHT = 132;
const SLEEP_HEIGHT = 78;
const PAD_X = 22;
const PAD_TOP = 12;
const PAD_BOTTOM = 18;

/** The same local-midnight construction the rest of this page formats calendar days with, so no zone can move a day. */
function formatDay(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const SERIES = [
  { key: 'mood' as const, label: 'Mood', color: MOOD_COLOR },
  { key: 'energy' as const, label: 'Energy', color: ENERGY_COLOR },
  { key: 'stress' as const, label: 'Stress', color: STRESS_COLOR },
];

/** 1 to 5, the scale every one of these three questions is already asked on. */
const RATING_MIN = 1;
const RATING_MAX = 5;
/** The hours the sleep strip spans. Wide enough to hold every band the app can store. */
const SLEEP_MIN = 4;
const SLEEP_MAX = 9;

export function CheckinHistoryChart({ checkins }: { checkins: DailyCheckin[] }) {
  const [showAllDays, setShowAllDays] = useState(false);
  const points = buildCheckinSeries(checkins);

  if (points.length === 0) {
    return <p className="mt-3 text-sm text-[#6B7A72]">No check-ins recorded yet.</p>;
  }

  const lastIndex = Math.max(points.length - 1, 1);
  const xFor = (index: number) =>
    points.length === 1 ? WIDTH / 2 : PAD_X + (index / lastIndex) * (WIDTH - PAD_X * 2);

  const ratingY = (value: number) =>
    PAD_TOP +
    (RATING_HEIGHT - PAD_TOP - PAD_BOTTOM) *
      (1 - (value - RATING_MIN) / (RATING_MAX - RATING_MIN));
  const sleepY = (hours: number) =>
    PAD_TOP +
    (SLEEP_HEIGHT - PAD_TOP - PAD_BOTTOM) * (1 - (hours - SLEEP_MIN) / (SLEEP_MAX - SLEEP_MIN));

  function pathFor(
    read: (point: CheckinSeriesPoint) => number | null,
    y: (value: number) => number
  ): string[] {
    return seriesSegments(points, read).map((segment) =>
      segment
        .map((index, position) => {
          const value = read(points[index]!)!;
          return `${position === 0 ? 'M' : 'L'} ${xFor(index)} ${y(value)}`;
        })
        .join(' ')
    );
  }

  const loggedCount = points.filter((point) => point.logged).length;
  const gapCount = points.length - loggedCount;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#6B7A72]">
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: series.color }}
              aria-hidden="true"
            />
            {series.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: SLEEP_COLOR }}
            aria-hidden="true"
          />
          Sleep
        </span>
      </div>

      <div className="mt-2 rounded-2xl bg-[#FAFAF8] p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#6B7A72]">
          Mood, Energy, Stress (1 to 5)
        </p>
        <svg
          viewBox={`0 0 ${WIDTH} ${RATING_HEIGHT}`}
          className="mt-1 w-full"
          role="img"
          aria-label={`Mood, energy and stress across ${points.length} days, ${loggedCount} of them logged`}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <line
              key={value}
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={ratingY(value)}
              y2={ratingY(value)}
              stroke={GRID_COLOR}
              strokeWidth={1}
            />
          ))}
          {[1, 3, 5].map((value) => (
            <text
              key={`label-${value}`}
              x={PAD_X - 6}
              y={ratingY(value) + 3}
              textAnchor="end"
              style={{ fontSize: 9 }}
              className="fill-[#9AA79F]"
            >
              {value}
            </text>
          ))}

          {SERIES.map((series) =>
            pathFor((point) => point[series.key], ratingY).map((d, index) => (
              <path
                key={`${series.key}-${index}`}
                d={d}
                fill="none"
                stroke={series.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))
          )}

          {SERIES.map((series) =>
            points.map((point, index) => {
              const value = point[series.key];
              if (value === null) return null;
              return (
                <circle
                  key={`${series.key}-dot-${point.date}`}
                  cx={xFor(index)}
                  cy={ratingY(value)}
                  r={3}
                  fill={series.color}
                  stroke={SURFACE_COLOR}
                  strokeWidth={1.5}
                >
                  {/* One pre-joined string child: interpolated children
                      inside <title> server-render empty (see
                      components/case-view/OverlayChart.tsx). */}
                  <title>{`${series.label}, ${formatDay(point.date)}: ${value} of 5`}</title>
                </circle>
              );
            })
          )}
        </svg>
      </div>

      <div className="mt-2 rounded-2xl bg-[#FAFAF8] p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#6B7A72]">
          Sleep (hours)
        </p>
        <svg
          viewBox={`0 0 ${WIDTH} ${SLEEP_HEIGHT}`}
          className="mt-1 w-full"
          role="img"
          aria-label={`Sleep across the same ${points.length} days`}
        >
          {[5, 7, 9].map((hours) => (
            <line
              key={hours}
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={sleepY(hours)}
              y2={sleepY(hours)}
              stroke={GRID_COLOR}
              strokeWidth={1}
            />
          ))}
          {[5, 7, 9].map((hours) => (
            <text
              key={`sleep-label-${hours}`}
              x={PAD_X - 6}
              y={sleepY(hours) + 3}
              textAnchor="end"
              style={{ fontSize: 9 }}
              className="fill-[#9AA79F]"
            >
              {hours}
            </text>
          ))}

          {pathFor((point) => point.sleepHours, sleepY).map((d, index) => (
            <path
              key={`sleep-${index}`}
              d={d}
              fill="none"
              stroke={SLEEP_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {points.map((point, index) =>
            point.sleepHours === null ? null : (
              <circle
                key={`sleep-dot-${point.date}`}
                cx={xFor(index)}
                cy={sleepY(point.sleepHours)}
                r={3}
                fill={SLEEP_COLOR}
                stroke={SURFACE_COLOR}
                strokeWidth={1.5}
              >
                {/* The BAND is what she answered, so the band is what the
                    label says. The hours position is only where to draw it. */}
                <title>{`Sleep, ${formatDay(point.date)}: ${point.sleepBand}`}</title>
              </circle>
            )
          )}
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-[#9AA79F]">
        <span>{formatDay(points[0]!.date)}</span>
        <span>{formatDay(points[points.length - 1]!.date)}</span>
      </div>
      {gapCount > 0 && (
        <p className="mt-1 text-[11px] text-[#6B7A72]">
          {gapCount === 1 ? '1 day in this span has no check-in' : `${gapCount} days in this span have no check-in`}
          , and the lines break there rather than joining across it.
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowAllDays((current) => !current)}
        className="mef-focus-ring mt-3 rounded-full border border-[#1B3A2D]/10 px-4 py-2 text-xs font-medium text-[#3E5C46] transition hover:bg-[#1B3A2D]/[0.03]"
        aria-expanded={showAllDays}
      >
        {showAllDays ? 'Hide all days' : 'Show all days'}
      </button>

      {showAllDays && (
        <ul className="mt-3 divide-y divide-[#1B3A2D]/5">
          {checkins.map((checkin) => (
            <li
              key={checkin.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
            >
              <span className="font-medium text-[#1B3A2D]">{formatDay(checkin.local_date)}</span>
              <span className="text-[#6B7A72]">
                Mood {checkin.mood_level ?? '-'} · Energy {checkin.energy_level ?? '-'} · Sleep{' '}
                {checkin.sleep_duration ?? '-'} · Stress {checkin.stress_level ?? '-'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
