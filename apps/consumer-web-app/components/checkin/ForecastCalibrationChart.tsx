'use client';

/**
 * Forecast & Calibration Loop — her cumulative forecast accuracy over
 * time, alongside Root's, in the same hand-rolled-SVG house style as
 * every other chart here (case-view/OverlayChart.tsx: 2px lines, round
 * join/cap, endpoint labels, one recessive hairline baseline, "View as
 * list" fallback). The caller (lib/energy-forecast/service.ts) only ever
 * passes a series once both her and Root's scored-forecast counts have
 * cleared MIN_SCORED_FORECASTS_FOR_CALIBRATION — this component adds its
 * own defensive floor on top, so it can never render an empty frame or a
 * one/two-point line even if a future caller forgets that gate.
 */
import { useState } from 'react';
import type { CalibrationPoint } from '@/lib/energy-forecast/types';

const HER_COLOR = '#1B3A2D';
const ROOT_COLOR = '#B08900';
const GRID_COLOR = 'rgba(27,58,45,0.10)';
const SURFACE_COLOR = '#FAFAF8';

/** Never render a chart from too few points — the numbers would be technically real but visually meaningless as a "trend." */
const MIN_CHART_POINTS = 3;

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function ForecastCalibrationChart({ series }: { series: CalibrationPoint[] }) {
  const [tableOpen, setTableOpen] = useState(false);

  if (series.length < MIN_CHART_POINTS) return null;

  const width = 320;
  const height = 128;
  const padX = 14;
  const padTop = 16;
  const padBottom = 26;

  const xFor = (i: number) => padX + (i / (series.length - 1)) * (width - padX * 2);
  const yFor = (pct: number) => padTop + (height - padTop - padBottom) * (1 - pct / 100);

  const herPath = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.herAccuracyPct)}`).join(' ');
  const rootPath = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.rootAccuracyPct)}`).join(' ');

  const last = series[series.length - 1]!;
  const first = series[0]!;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-4 text-[11px] text-[#6B7A72]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HER_COLOR }} />
          You
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ROOT_COLOR }} />
          Root
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`Forecast accuracy over time — you ${last.herAccuracyPct}%, Root ${last.rootAccuracyPct}% as of ${formatDate(last.date)}`}
      >
        <line
          x1={padX}
          y1={height - padBottom}
          x2={width - padX}
          y2={height - padBottom}
          stroke={GRID_COLOR}
          strokeWidth={1}
        />
        <path d={herPath} fill="none" stroke={HER_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path
          d={rootPath}
          fill="none"
          stroke={ROOT_COLOR}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 3"
        />
        <circle cx={xFor(series.length - 1)} cy={yFor(last.herAccuracyPct)} r={3.5} fill={HER_COLOR} stroke={SURFACE_COLOR} strokeWidth={1.5}>
          <title>{`You, ${formatDate(last.date)} — ${last.herAccuracyPct}%`}</title>
        </circle>
        <circle cx={xFor(series.length - 1)} cy={yFor(last.rootAccuracyPct)} r={3.5} fill={ROOT_COLOR} stroke={SURFACE_COLOR} strokeWidth={1.5}>
          <title>{`Root, ${formatDate(last.date)} — ${last.rootAccuracyPct}%`}</title>
        </circle>
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
        <span>{formatDate(last.date)}</span>
      </div>

      {tableOpen && (
        <ul className="mt-2 space-y-1 rounded-xl bg-[#FAFAF8] p-2 text-[11px] text-[#6B7A72]">
          {series.map((p) => (
            <li key={p.date} className="flex items-center justify-between gap-2">
              <span>{formatDate(p.date)}</span>
              <span className="font-medium text-[#1B3A2D]">
                You: {p.herAccuracyPct}% · Root: {p.rootAccuracyPct}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
