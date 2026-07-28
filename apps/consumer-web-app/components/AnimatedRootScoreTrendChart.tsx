'use client';

/**
 * Both Root Score charts on the member platform (Progress's "Root Score"
 * panel and the Root Score detail page's "Root Score Trend" section)
 * share this one component. Rebuilt (2026-07-28) onto
 * components/TrendChartCard.tsx / components/TrendChart.tsx so both gain
 * a real 0-100 value axis, per-point date labels, and the
 * 1-week/2-week/1-month range selector — the same shared chart Home's
 * Energy Trend chart now uses (components/dashboard/AnimatedEnergyTrendChart.tsx),
 * just configured for the Root Score's own true range instead of energy's
 * 1-5 scale.
 *
 * components/RootScoreTrendChart.tsx (the old plain chart this used to
 * wrap in components/ScrollDrawIn.tsx) is deleted outright — this was its
 * only remaining consumer anywhere in the app (confirmed by grep before
 * removing it). Its dots were already a flat forest green with no
 * red/gold grading, and that's unchanged here — TrendChart.tsx uses the
 * same flat `#1B3A2D` for every point everywhere.
 *
 * Same export name, same file path — app/progress/ProgressRootScorePanel.tsx
 * and app/root-score/page.tsx don't need their import statements to
 * change, only the new `todayLocalDate` prop threaded through.
 */

import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { TrendChartCard } from '@/components/TrendChartCard';
import { formatDate, type TrendChartPoint } from '@/components/TrendChart';

const ROOT_SCORE_MIN = 0;
const ROOT_SCORE_MAX = 100;
const ROOT_SCORE_AXIS_TICKS = [0, 50, 100];

function toLocalDateFallback(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function AnimatedRootScoreTrendChart({
  snapshots,
  todayLocalDate,
}: {
  snapshots: RootScoreSnapshot[];
  todayLocalDate?: string;
}) {
  const points: TrendChartPoint[] = snapshots
    .filter((s): s is RootScoreSnapshot & { root_score: number } => s.root_score !== null)
    .map((s) => ({ id: s.id, local_date: s.local_date, value: s.root_score }));

  return (
    <TrendChartCard
      points={points}
      todayLocalDate={todayLocalDate ?? toLocalDateFallback()}
      min={ROOT_SCORE_MIN}
      max={ROOT_SCORE_MAX}
      axisTicks={ROOT_SCORE_AXIS_TICKS}
      formatValue={(v) => `${v}`}
      formatTooltip={(p) => `${formatDate(p.local_date)} · ${p.value}`}
      metricName="Root Score"
    />
  );
}
