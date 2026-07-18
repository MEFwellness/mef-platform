/**
 * Interactive-feeling (hover/focus highlights a category) radar chart
 * comparing every category on one wheel. Plotted as (1 - score/maxScore)
 * per axis — same "fuller is healthier" convention as ScoreRing — so a
 * member reads a small, tucked-in polygon as "several areas need
 * attention" at a glance, the way an Oura/WHOOP recovery wheel reads.
 * Pure SVG, no charting dependency, consistent with every other chart in
 * this app (see components/RootScoreTrendChart.tsx).
 */

'use client';

import { useState } from 'react';
import { priorityToStatus } from '@/lib/assessments/presentation';
import type { PriorityLevel } from '@/lib/assessments/engine/types';

const POINT_COLOR: Record<string, string> = {
  good: '#16A34A',
  attention: '#F59E0B',
  poor: '#EF4444',
};

export type RadarDatum = {
  categoryId: string;
  label: string;
  score: number;
  maxScore: number;
  priority: PriorityLevel;
};

const SIZE = 300;
const CENTER = SIZE / 2;
const MAX_RADIUS = CENTER - 64;
const GRID_LEVELS = [0.25, 0.5, 0.75, 1];

function polarPoint(index: number, count: number, ratio: number) {
  const angle = -Math.PI / 2 + index * ((2 * Math.PI) / count);
  const r = MAX_RADIUS * ratio;
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
}

export function CategoryRadarChart({ points }: { points: RadarDatum[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (points.length < 3) return null;

  const ratios = points.map((p) => (p.maxScore > 0 ? Math.max(0, Math.min(1, 1 - p.score / p.maxScore)) : 0));
  const polygonPoints = points.map((_, i) => polarPoint(i, points.length, ratios[i]!));
  const polygonPath = polygonPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto h-auto w-full max-w-sm"
        role="img"
        aria-label={`Category comparison wheel: ${points
          .map((p) => `${p.label} ${p.score} of ${p.maxScore}, ${p.priority} priority`)
          .join('; ')}`}
      >
        {GRID_LEVELS.map((level) => {
          const pts = points.map((_, i) => polarPoint(i, points.length, level));
          return (
            <polygon
              key={level}
              points={pts.map((pt) => `${pt.x},${pt.y}`).join(' ')}
              fill="none"
              stroke="#1B3A2D"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          );
        })}

        {points.map((p, i) => {
          const outer = polarPoint(i, points.length, 1);
          return (
            <line
              key={p.categoryId}
              x1={CENTER}
              y1={CENTER}
              x2={outer.x}
              y2={outer.y}
              stroke="#1B3A2D"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          );
        })}

        <polygon
          points={polygonPath}
          fill="#1B3A2D"
          fillOpacity={0.14}
          stroke="#1B3A2D"
          strokeOpacity={0.55}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {points.map((p, i) => {
          const dot = polygonPoints[i]!;
          const isActive = activeId === p.categoryId;
          return (
            <circle
              key={p.categoryId}
              cx={dot.x}
              cy={dot.y}
              r={isActive ? 6 : 4}
              fill={POINT_COLOR[priorityToStatus(p.priority)]}
              stroke="#fff"
              strokeWidth={1.5}
              className="cursor-pointer transition-[r]"
              onMouseEnter={() => setActiveId(p.categoryId)}
              onMouseLeave={() => setActiveId((current) => (current === p.categoryId ? null : current))}
              onFocus={() => setActiveId(p.categoryId)}
              onBlur={() => setActiveId((current) => (current === p.categoryId ? null : current))}
              tabIndex={0}
              role="button"
              aria-label={`${p.label}: ${p.score} of ${p.maxScore}, ${p.priority} priority`}
            />
          );
        })}

        {points.map((p, i) => {
          const labelPos = polarPoint(i, points.length, 1.22);
          const isActive = activeId === p.categoryId;
          return (
            <text
              key={p.categoryId}
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className={`select-none text-[9.5px] capitalize transition-colors ${isActive ? 'fill-[#1B3A2D] font-semibold' : 'fill-[#6B7A72] font-medium'}`}
            >
              {p.label}
            </text>
          );
        })}
      </svg>

      {activeId && (
        <p className="mt-1 text-center text-xs text-[#6B7A72]" aria-live="polite">
          {(() => {
            const active = points.find((p) => p.categoryId === activeId)!;
            return `${active.label}: ${active.score} of ${active.maxScore}`;
          })()}
        </p>
      )}
    </div>
  );
}
