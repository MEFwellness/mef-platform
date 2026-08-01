'use client';

/**
 * Case View — the overlay chart (requirement 4): both of a finding's
 * variables, real stored values, on one chart. No overlay/two-series
 * chart existed anywhere in this codebase before this — built in the
 * same hand-rolled-SVG house style as every other chart here (2px lines,
 * round join/cap, endpoint markers + labels, one recessive hairline
 * baseline, "View as list" fallback), but with a genuine date-based
 * x-axis instead of the usual index-based spacing: a lag offset (a day
 * shift when the finding is strongest one day later) is only visually
 * meaningful if both series sit in the same real time coordinate space.
 */

import { useState } from 'react';
import type { OverlaySeries } from '@/lib/case-view/types';

const OUTCOME_COLOR = '#1B3A2D';
const DRIVER_COLOR = '#B08900';
const GRID_COLOR = 'rgba(27,58,45,0.10)';
const SURFACE_COLOR = '#FAFAF8';

/** `timeZone: 'UTC'` avoids a server/client hydration mismatch — see GoalProgressChart.tsx's identical fix for why. */
function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function dayIndex(date: string): number {
  return Math.round(new Date(`${date}T12:00:00Z`).getTime() / (24 * 60 * 60 * 1000));
}

export function OverlayChart({ overlay }: { overlay: OverlaySeries }) {
  const [tableOpen, setTableOpen] = useState(false);

  const allDates = [...overlay.outcomePoints, ...overlay.driverPoints].map((p) => dayIndex(p.date));
  if (allDates.length < 2) return null;

  const minDay = Math.min(...allDates);
  const maxDay = Math.max(...allDates);
  const span = Math.max(maxDay - minDay, 1);

  const width = 320;
  const height = 128;
  const padX = 14;
  const padTop = 22;
  const padBottom = 26;

  const xFor = (date: string) => padX + ((dayIndex(date) - minDay) / span) * (width - padX * 2);

  function yForNormalized(values: number[], value: number): number {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return padTop + (height - padTop - padBottom) * (1 - (value - min) / range);
  }

  const outcomeValues = overlay.outcomePoints.map((p) => p.value);
  const driverValues = overlay.driverPoints.map((p) => p.value);

  const outcomePath = overlay.outcomePoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.date)} ${yForNormalized(outcomeValues, p.value)}`)
    .join(' ');
  const driverPath = overlay.driverPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.date)} ${yForNormalized(driverValues, p.value)}`)
    .join(' ');

  const lastOutcome = overlay.outcomePoints[overlay.outcomePoints.length - 1];
  const lastDriver = overlay.driverPoints[overlay.driverPoints.length - 1];

  const combinedDates = [...new Set([...overlay.outcomePoints, ...overlay.driverPoints].map((p) => p.date))].sort();
  const outcomeByDate = new Map(overlay.outcomePoints.map((p) => [p.date, p.value]));
  const driverByDate = new Map(overlay.driverPoints.map((p) => [p.date, p.value]));

  return (
    <div className="mt-3">
      <div className="flex items-center gap-4 text-[11px] text-[#6B7A72]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: OUTCOME_COLOR }} />
          {overlay.outcomeLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DRIVER_COLOR }} />
          {overlay.driverLabel}
          {overlay.lagOffsetDays > 0 ? ' (shifted)' : ''}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${overlay.outcomeLabel} and ${overlay.driverLabel} plotted together over time${overlay.lagNote ? `. ${overlay.lagNote}` : ''}`}
      >
        <line x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} stroke={GRID_COLOR} strokeWidth={1} />
        <path d={outcomePath} fill="none" stroke={OUTCOME_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={driverPath} fill="none" stroke={DRIVER_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" />

        {overlay.outcomePoints.map((p) => (
          <circle
            key={`o-${p.date}`}
            cx={xFor(p.date)}
            cy={yForNormalized(outcomeValues, p.value)}
            r={3.5}
            fill={OUTCOME_COLOR}
            stroke={SURFACE_COLOR}
            strokeWidth={1.5}
          >
            {/* Single pre-joined string child — see GoalProgressChart.tsx's
                identical comment for why multiple interpolated children
                inside <title> server-render empty. */}
            <title>{`${overlay.outcomeLabel}, ${formatDate(p.date)}: ${p.value}`}</title>
          </circle>
        ))}
        {overlay.driverPoints.map((p) => (
          <circle
            key={`d-${p.date}`}
            cx={xFor(p.date)}
            cy={yForNormalized(driverValues, p.value)}
            r={3.5}
            fill={DRIVER_COLOR}
            stroke={SURFACE_COLOR}
            strokeWidth={1.5}
          >
            <title>{`${overlay.driverLabel}, ${formatDate(p.date)}: ${p.value}`}</title>
          </circle>
        ))}

        {lastOutcome && (
          <text
            x={xFor(lastOutcome.date)}
            y={yForNormalized(outcomeValues, lastOutcome.value) - 8}
            textAnchor="end"
            style={{ fontSize: 10, fontWeight: 600 }}
            className="fill-[#1B3A2D]"
          >
            {overlay.outcomeLabel}
          </text>
        )}
        {lastDriver && (
          <text
            x={xFor(lastDriver.date)}
            y={yForNormalized(driverValues, lastDriver.value) + 14}
            textAnchor="end"
            style={{ fontSize: 10, fontWeight: 600 }}
            className="fill-[#B08900]"
          >
            {overlay.driverLabel}
          </text>
        )}
      </svg>

      {overlay.lagNote && <p className="mt-1.5 text-[11px] italic text-[#6B7A72]">{overlay.lagNote}</p>}

      <div className="mt-1 flex items-center justify-between text-[10px] text-[#9AA79F]">
        <span>{formatDate(combinedDates[0]!)}</span>
        <button
          type="button"
          onClick={() => setTableOpen((o) => !o)}
          className="underline decoration-dotted underline-offset-2 hover:text-[#6B7A72]"
        >
          {tableOpen ? 'Hide values' : 'View as list'}
        </button>
        <span>{formatDate(combinedDates[combinedDates.length - 1]!)}</span>
      </div>

      {tableOpen && (
        <ul className="mt-2 space-y-1 rounded-xl bg-[#FAFAF8] p-2 text-[11px] text-[#6B7A72]">
          {combinedDates.map((date) => (
            <li key={date} className="flex items-center justify-between gap-2">
              <span>{formatDate(date)}</span>
              <span className="font-medium text-[#1B3A2D]">
                {overlay.outcomeLabel}: {outcomeByDate.get(date) ?? '-'} · {overlay.driverLabel}: {driverByDate.get(date) ?? '-'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
