'use client';

/**
 * The stateful shell shared by all three member-platform trend charts:
 * owns the 1-week/2-week/1-month range selection (defaults to 1 week),
 * slices the already-fetched real data down to that window, and renders
 * the range pills + components/TrendChart.tsx inside the exact same
 * components/ScrollDrawIn.tsx animation the charts already used.
 *
 * Data is never re-fetched per range — each caller already hands in the
 * full real history its own page query fetched (e.g. 30 days of
 * check-ins, 90 days of Root Score snapshots), which already covers the
 * longest window this control offers (1 month). Switching ranges re-slices
 * that same real array and re-renders; no new query, no new endpoint.
 *
 * Sparse/empty ranges are shown honestly: zero real points in the window
 * renders a plain "no data yet" message (the range pills stay usable so a
 * member can pick a wider window); exactly one point renders that single
 * dot with no fabricated line.
 */

import { useState } from 'react';
import { ScrollDrawIn } from '@/components/ScrollDrawIn';
import { TrendChart, computeRangeWindow, sliceToWindow, type TrendChartPoint } from '@/components/TrendChart';
import { TrendRangeSelector, TREND_RANGE_DAYS, TREND_RANGE_LABELS, type TrendRange } from '@/components/TrendRangeSelector';

type Props = {
  /** All real points the page already fetched, oldest first — must cover at least the longest range offered (30 days). */
  points: TrendChartPoint[];
  /** The member's real, timezone-resolved local "today" (YYYY-MM-DD) — anchors the trailing window so an un-logged today shows as a real gap. */
  todayLocalDate: string;
  min: number;
  max: number;
  axisTicks: number[];
  formatValue: (value: number) => string;
  formatTooltip: (point: TrendChartPoint) => string;
  /** Lowercase metric name for aria-labels and the empty-range message, e.g. "energy" or "Root Score". */
  metricName: string;
};

export function TrendChartCard({
  points,
  todayLocalDate,
  min,
  max,
  axisTicks,
  formatValue,
  formatTooltip,
  metricName,
}: Props) {
  const [range, setRange] = useState<TrendRange>('1w');

  const { start, end, totalDays } = computeRangeWindow(todayLocalDate, TREND_RANGE_DAYS[range]);
  const windowPoints = sliceToWindow(points, start, end);

  return (
    <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-4">
      <div className="mb-3 flex justify-end">
        <TrendRangeSelector value={range} onChange={setRange} />
      </div>

      <ScrollDrawIn resetKey={range}>
        <TrendChart
          points={windowPoints}
          windowStart={start}
          totalDays={totalDays}
          min={min}
          max={max}
          axisTicks={axisTicks}
          formatValue={formatValue}
          formatTooltip={formatTooltip}
          ariaLabel={`${metricName} trend, ${TREND_RANGE_LABELS[range].toLowerCase()}, ${windowPoints.length} recorded day${windowPoints.length === 1 ? '' : 's'}`}
          emptyRangeMessage={`No ${metricName} data yet for the last ${TREND_RANGE_LABELS[range].toLowerCase()}.`}
        />
      </ScrollDrawIn>
    </div>
  );
}
