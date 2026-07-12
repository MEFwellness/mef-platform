'use client';

import { useState } from 'react';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { energyStatus, STATUS_STYLES } from './status';

type Props = {
  checkins: DailyCheckin[]; // oldest first
};

const PAD_X = 5; // percent inset on each side — keeps marker circles fully inside the chart
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

// Matches STATUS_STYLES' .dot classes in status.ts (green-600/amber-500/
// red-500) — SVG fill needs a raw hex, so these have to be kept in sync
// by hand rather than reusing the Tailwind class string directly.
const DOT_FILL: Record<string, string> = {
  good: '#16A34A',
  attention: '#F59E0B',
  poor: '#EF4444',
  'no-data': '#EFE9DB',
};

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function EnergyTrendChart({ checkins }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (checkins.length === 0) {
    return (
      <div className="mt-4 flex h-40 items-center justify-center rounded-2xl bg-[#F3F6F4] p-4">
        <p className="text-sm text-[#1B3A2D]/70">Trends will show up here after a few check-ins.</p>
      </div>
    );
  }

  const points = checkins.map((c, i) => {
    const value = c.energy_level ?? 0;
    const normalized = value / 5;
    const x = checkins.length === 1 ? 50 : PAD_X + (i / (checkins.length - 1)) * (100 - 2 * PAD_X);
    const y = PAD_TOP + (1 - normalized) * (100 - PAD_TOP - PAD_BOTTOM);
    return { x, y, checkin: c, status: energyStatus(c.energy_level) };
  });

  const linePath = buildSmoothPath(points.map((p) => ({ x: p.x, y: p.y })));
  const baseline = 100 - PAD_BOTTOM;
  const areaPath = `${linePath} L ${points[points.length - 1]!.x} ${baseline} L ${points[0]!.x} ${baseline} Z`;

  const active = activeIndex !== null ? points[activeIndex] : null;

  return (
    <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-4">
      <div className="relative h-40 w-full overflow-hidden rounded-xl">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`Energy trend over the last ${checkins.length} check-ins`}
        >
          <defs>
            <linearGradient id="energyAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B3A2D" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#1B3A2D" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Gridlines at the 1-5 scale */}
          {[1, 2, 3, 4, 5].map((n) => {
            const y = PAD_TOP + (1 - n / 5) * (100 - PAD_TOP - PAD_BOTTOM);
            return (
              <line
                key={n}
                x1={PAD_X}
                x2={100 - PAD_X}
                y1={y}
                y2={y}
                stroke="#1B3A2D"
                strokeOpacity={0.06}
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <path d={areaPath} fill="url(#energyAreaFill)" stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="#1B3A2D"
            strokeOpacity={0.45}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Point markers as HTML overlay, not SVG shapes — stay perfectly round
            regardless of the SVG's non-uniform stretch (preserveAspectRatio=none). */}
        {points.map((p, i) => (
          <button
            key={p.checkin.id}
            type="button"
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none"
            style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: DOT_FILL[p.status] }}
            aria-label={`${formatDate(p.checkin.local_date)}: energy ${p.checkin.energy_level ?? 'not logged'} out of 5, ${p.status.replace('-', ' ')}`}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex((current) => (current === i ? null : current))}
            onFocus={() => setActiveIndex(i)}
            onBlur={() => setActiveIndex((current) => (current === i ? null : current))}
            onClick={() => setActiveIndex(i)}
          />
        ))}

        {active && (
          <div
            className={`pointer-events-none absolute -translate-x-1/2 rounded-xl px-3 py-1.5 text-xs font-medium shadow-[0_4px_16px_-4px_rgba(27,58,45,0.25)] ${STATUS_STYLES[active.status].bg} ${STATUS_STYLES[active.status].text}`}
            style={{
              left: `${active.x}%`,
              top: `${Math.max(active.y - 14, 4)}%`,
            }}
          >
            {formatDate(active.checkin.local_date)} · Energy {active.checkin.energy_level ?? '—'}/5
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-[#1B3A2D]/70">
        <span>{formatDate(checkins[0]!.local_date)}</span>
        {checkins.length > 1 && (
          <span>{formatDate(checkins[checkins.length - 1]!.local_date)}</span>
        )}
      </div>
    </div>
  );
}
