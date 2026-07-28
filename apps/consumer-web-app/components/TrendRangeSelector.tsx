'use client';

/**
 * Shared time-range pill row for the three member-platform trend charts
 * (Home Energy Trend, Progress Root Score, Root Score detail's Root Score
 * Trend) — one control, one visual language, so "consistent across all
 * three" is true by construction rather than three hand-matched copies.
 *
 * Same pill shape already proven by app/progress/TrendsPanel.tsx's metric
 * selector (`rounded-full px-3.5 py-1.5`), but with the locked selected
 * state this task specifies: forest `#1B3A2D` fill, cream `#F5F0E4` text.
 * Unselected pills stay quiet (transparent, muted forest text) so the
 * selected range is the only thing competing for attention.
 */

export type TrendRange = '1w' | '2w' | '1m';

export const TREND_RANGE_DAYS: Record<TrendRange, number> = {
  '1w': 7,
  '2w': 14,
  '1m': 30,
};

export const TREND_RANGE_LABELS: Record<TrendRange, string> = {
  '1w': '1 Week',
  '2w': '2 Weeks',
  '1m': '1 Month',
};

const RANGES: TrendRange[] = ['1w', '2w', '1m'];

export function TrendRangeSelector({
  value,
  onChange,
}: {
  value: TrendRange;
  onChange: (range: TrendRange) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Chart time range"
      className="inline-flex items-center gap-1 rounded-full bg-white/60 p-1"
    >
      {RANGES.map((range) => {
        const selected = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(range)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              selected
                ? 'bg-[#1B3A2D] text-[#F5F0E4]'
                : 'text-[#1B3A2D]/60 hover:text-[#1B3A2D]'
            }`}
          >
            {TREND_RANGE_LABELS[range]}
          </button>
        );
      })}
    </div>
  );
}
