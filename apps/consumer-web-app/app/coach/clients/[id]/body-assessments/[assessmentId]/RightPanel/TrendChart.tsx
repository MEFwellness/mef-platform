'use client';

/**
 * Self-contained SVG sparkline for one finding_type's history across a
 * member's assessments — no charting library, per the milestone's "keep it
 * simple" constraint. Built per the dataviz skill's method: a single series
 * needs no legend (the title already names what's plotted), a 2px line
 * with round join/cap, >=8px end markers with a 2px surface ring, one
 * recessive hairline baseline, a direct label on the endpoint only, and a
 * native <title> hover tooltip per point (the lightweight equivalent of a
 * full crosshair+tooltip layer for an embedded widget this small). Colors
 * reuse this dashboard's own established tones (the brand ink for the
 * line/marks, the same emerald/red/muted trio ComparisonSummary already
 * uses for improved/declined/stable) rather than the generic palette
 * reference, so this widget reads as part of the same system as the rest
 * of the coach dashboard.
 */

import { useId, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { EmptyState } from './EmptyState';

export type TrendPoint = {
  /** ISO date string this point was recorded at. */
  date: string;
  /** Already normalized onto a comparable scale (e.g. a 0-100 posture score) — TrendChart only plots, it does not compute the score. */
  value: number;
  /** Optional human-readable value for the hover tooltip, e.g. "Mild". Falls back to the raw value. */
  valueLabel?: string;
};

const LINE_COLOR = '#1B3A2D';
const GRID_COLOR = 'rgba(27,58,45,0.10)';
const SURFACE_COLOR = '#FAFAF8';

const DELTA_TONE = {
  improved: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-50 text-red-700',
  stable: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]',
} as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TrendChart({
  title,
  points,
  higherIsBetter = true,
  changeAgainstLabel = 'vs. first assessment',
  emptyDescription = 'Complete more assessments to see a trend here.',
}: {
  title: string;
  points: TrendPoint[];
  /** Whether a rising value reads as improvement (true) or decline (false) — controls both the % change annotation's color and its improved/declined wording. */
  higherIsBetter?: boolean;
  changeAgainstLabel?: string;
  emptyDescription?: string;
}) {
  const gradientId = useId();
  const [tableOpen, setTableOpen] = useState(false);

  if (points.length < 2) {
    return (
      <EmptyState
        icon={TrendingUp}
        title={`${title}: not enough history yet`}
        description={emptyDescription}
      />
    );
  }

  const width = 320;
  const height = 108;
  const padX = 14;
  const padTop = 22;
  const padBottom = 20;

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const xFor = (index: number) =>
    points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2);
  const yFor = (value: number) =>
    padTop + (height - padTop - padBottom) * (1 - (value - minValue) / range);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ');

  const first = points[0]!;
  const latest = points[points.length - 1]!;
  const delta = latest.value - first.value;
  const pctChange = first.value !== 0 ? (delta / Math.abs(first.value)) * 100 : delta === 0 ? 0 : 100;
  const direction: 'improved' | 'declined' | 'stable' =
    Math.round(pctChange) === 0 ? 'stable' : (delta > 0) === higherIsBetter ? 'improved' : 'declined';
  const directionLabel =
    direction === 'stable' ? 'No change' : direction === 'improved' ? 'Improved' : 'Declined';

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[#1B3A2D]">{title}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${DELTA_TONE[direction]}`}>
          {directionLabel} {pctChange > 0 ? '+' : ''}
          {Math.round(pctChange)}% <span className="opacity-70">{changeAgainstLabel}</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${title} trend across ${points.length} assessments, ${directionLabel.toLowerCase()} ${Math.abs(Math.round(pctChange))}% ${changeAgainstLabel}`}
      >
        <defs>
          <clipPath id={`${gradientId}-clip`}>
            <rect x={0} y={0} width={width} height={height} />
          </clipPath>
        </defs>
        {/* Recessive hairline baseline — the one gridline this small a chart needs. */}
        <line
          x1={padX}
          y1={height - padBottom}
          x2={width - padX}
          y2={height - padBottom}
          stroke={GRID_COLOR}
          strokeWidth={1}
        />
        <path
          d={linePath}
          fill="none"
          stroke={LINE_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const isEndpoint = i === points.length - 1;
          const cx = xFor(i);
          const cy = yFor(p.value);
          return (
            <g key={p.date + i}>
              <circle cx={cx} cy={cy} r={5} fill={LINE_COLOR} stroke={SURFACE_COLOR} strokeWidth={2}>
                <title>
                  {formatDate(p.date)} — {p.valueLabel ?? p.value}
                </title>
              </circle>
              {isEndpoint && (
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="end"
                  className="fill-[#1B3A2D]"
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  {p.valueLabel ?? p.value}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex items-center justify-between text-[10px] text-[#9AA79F]">
        <span>{formatDate(first.date)}</span>
        <button
          type="button"
          onClick={() => setTableOpen((o) => !o)}
          className="underline decoration-dotted underline-offset-2 hover:text-[#6B7A72]"
        >
          {tableOpen ? 'Hide values' : 'View as list'}
        </button>
        <span>{formatDate(latest.date)}</span>
      </div>

      {tableOpen && (
        <ul className="mt-2 space-y-1 rounded-xl bg-[#FAFAF8] p-2 text-[11px] text-[#6B7A72]">
          {points.map((p, i) => (
            <li key={p.date + i} className="flex items-center justify-between gap-2">
              <span>{formatDate(p.date)}</span>
              <span className="font-medium text-[#1B3A2D]">{p.valueLabel ?? p.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
