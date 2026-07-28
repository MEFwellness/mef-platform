'use client';

/**
 * Home's Energy Trend chart. Rebuilt (2026-07-28) onto the shared
 * components/TrendChartCard.tsx / components/TrendChart.tsx so it gains a
 * real value axis (1-5, the check-in form's own energy scale — see
 * app/checkin/CheckinForm.tsx's ENERGY_MEANING word scale), per-point date
 * labels, and the 1-week/2-week/1-month range selector, matching the
 * other two trend charts on the member platform exactly (see
 * components/AnimatedRootScoreTrendChart.tsx, the sibling component for
 * both Root Score charts).
 *
 * This no longer renders components/EnergyTrendChart.tsx at all — that
 * file stays completely untouched (it's still the coach client view's own
 * chart, app/coach/clients/[id]/page.tsx, and app/progress/
 * MetricTrendChart.tsx's source of the shared buildSmoothPath/
 * energyBarWidth geometry helpers). The dot-color grading
 * EnergyTrendChart used (good/attention/poor -> green/amber/red, the
 * red/gold a member could see on Home) is dropped for this chart
 * specifically: every dot is now the same flat forest green
 * TrendChart.tsx uses everywhere, matching the fix already applied to
 * both Root Score charts and the Progress Trends card. No genuine
 * concern-state signal exists in daily_checkins that would warrant a real
 * alert color, so none was invented — same finding as every prior pass
 * over this data.
 *
 * Same export name, same file path, same props shape (`checkins`) plus
 * one new optional prop (`todayLocalDate`) — app/dashboard/page.tsx's
 * import doesn't need to change at all.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import { TrendChartCard } from '@/components/TrendChartCard';
import { formatDate, type TrendChartPoint } from '@/components/TrendChart';

const ENERGY_MIN = 1;
const ENERGY_MAX = 5;
const ENERGY_AXIS_TICKS = [1, 3, 5];

function toLocalDateFallback(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function AnimatedEnergyTrendChart({
  checkins,
  todayLocalDate,
}: {
  checkins: DailyCheckin[];
  todayLocalDate?: string;
}) {
  const points: TrendChartPoint[] = checkins
    .filter((c): c is DailyCheckin & { energy_level: number } => c.energy_level !== null)
    .map((c) => ({ id: c.id, local_date: c.local_date, value: c.energy_level }));

  return (
    <TrendChartCard
      points={points}
      todayLocalDate={todayLocalDate ?? toLocalDateFallback()}
      min={ENERGY_MIN}
      max={ENERGY_MAX}
      axisTicks={ENERGY_AXIS_TICKS}
      formatValue={(v) => `${v}`}
      formatTooltip={(p) => `${formatDate(p.local_date)} · Energy ${p.value}/5`}
      metricName="energy"
    />
  );
}
