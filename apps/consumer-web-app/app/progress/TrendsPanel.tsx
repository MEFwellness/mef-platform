'use client';

/**
 * Unified Trends card — Progress page restructure. Replaces the old
 * one-full-width-card-per-metric layout (a standalone Energy Trend card
 * plus a separate Recovery Trends/Weekly Insights wearable panel) with a
 * single card and a segmented control, so there's one place on the page
 * to see any trend over time. Segments are grouped — "From your
 * check-ins" (self-reported, 1-5/0-5 scales) vs "From your wearable"
 * (device-measured) — because they answer different questions and
 * shouldn't be visually conflated, even though they share one control.
 * The wearable group is omitted entirely when the member has never
 * connected a wearable (no data of any kind across all four metrics),
 * matching the honest-empty-state discipline already used elsewhere on
 * this page (WearableTrendsPanel used to do the same at the panel level;
 * now it's done at the segment-group level).
 *
 * Each segment reuses the same MetricTrendChart, which applies its own
 * minimum-data floor (5 real points) before drawing a line — no new
 * scoring logic, just normalized rendering. Segments used to carry a
 * per-metric `statusFor` classifier that colored each dot good/attention/
 * poor (green/amber/red) — removed page-wide in the "Your Wellness
 * Story" rework: an ordinary day's value isn't a genuine concern, and
 * red implied an alarm that wasn't real. Every dot on this page is now a
 * flat forest green, matching the Root Score chart.
 *
 * Distribution card task (2026-07-28): each check-in segment (not
 * wearable — a wearable metric is continuous, not a small fixed set of
 * levels) now also renders MetricDistributionCard directly below the line
 * chart, answering "what does a typical day look like" instead of "how
 * has this moved over time." `levelLabel` carries each metric's real
 * word scale (or, for Digestion, the plain numbers — see that
 * component's own doc comment for why no word scale exists for it).
 */

import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { DailyCheckin, WearableDailyMetric } from '@mef/shared-types-contracts';
import { MetricTrendChart, type TrendPoint } from './MetricTrendChart';
import { MetricDistributionCard } from './MetricDistributionCard';
import {
  energyLevelLabel,
  moodLabel,
  stressLabel,
  sleepQualityLabel,
  painLabel,
} from '@/lib/energy-forecast/scaleLabels';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

type Segment = {
  key: string;
  label: string;
  group: 'checkin' | 'wearable';
  points: TrendPoint[];
  min: number;
  max: number;
  unit: string;
  emptyStateCopy: string;
  /** Only present for check-in segments — the real word scale (or plain numbers) her check-in itself uses for this metric's levels. */
  levelLabel?: (level: number) => string;
};

export function hasWearableData(
  readinessHistory: WearableDailyMetric[],
  sleepHistory: WearableDailyMetric[],
  stepsHistory: WearableDailyMetric[],
  stressHistory: WearableDailyMetric[]
): boolean {
  return (
    readinessHistory.length > 0 ||
    sleepHistory.length > 0 ||
    stepsHistory.length > 0 ||
    stressHistory.length > 0
  );
}

export function dynamicBounds(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.1;
  return { min: min - pad, max: max + pad };
}

function checkinPoints<K extends keyof DailyCheckin>(
  checkins: DailyCheckin[],
  field: K
): TrendPoint[] {
  return checkins.map((c) => ({
    id: c.id,
    local_date: c.local_date,
    value: (c[field] as number | null) ?? null,
  }));
}

function wearablePoints(history: WearableDailyMetric[]): TrendPoint[] {
  return history.map((m) => ({ id: m.id, local_date: m.local_date, value: m.numeric_value }));
}

export function TrendsPanel({
  checkins,
  readinessHistory,
  sleepHistory,
  stepsHistory,
  stressHistory,
}: {
  checkins: DailyCheckin[]; // oldest first
  readinessHistory: WearableDailyMetric[];
  sleepHistory: WearableDailyMetric[];
  stepsHistory: WearableDailyMetric[];
  stressHistory: WearableDailyMetric[];
}) {
  const checkinSegments: Segment[] = [
    {
      key: 'energy',
      label: 'Energy',
      group: 'checkin',
      points: checkinPoints(checkins, 'energy_level'),
      min: 1,
      max: 5,
      unit: '/5',
      emptyStateCopy: 'Your energy pattern needs a few more check-ins before a trend can appear.',
      levelLabel: energyLevelLabel,
    },
    {
      key: 'mood',
      label: 'Mood',
      group: 'checkin',
      points: checkinPoints(checkins, 'mood_level'),
      min: 1,
      max: 5,
      unit: '/5',
      emptyStateCopy: 'Your mood pattern needs a few more check-ins before a trend can appear.',
      levelLabel: moodLabel,
    },
    {
      key: 'stress',
      label: 'Stress',
      group: 'checkin',
      points: checkinPoints(checkins, 'stress_level'),
      min: 1,
      max: 5,
      unit: '/5',
      emptyStateCopy: 'Your stress pattern needs a few more check-ins before a trend can appear.',
      levelLabel: stressLabel,
    },
    {
      key: 'sleep_quality',
      label: 'Sleep Quality',
      group: 'checkin',
      points: checkinPoints(checkins, 'sleep_quality'),
      min: 1,
      max: 5,
      unit: '/5',
      emptyStateCopy:
        'Your sleep quality pattern needs a few more check-ins before a trend can appear.',
      levelLabel: sleepQualityLabel,
    },
    {
      key: 'digestion',
      label: 'Digestion',
      group: 'checkin',
      points: checkinPoints(checkins, 'digestion_rating'),
      min: 1,
      max: 5,
      unit: '/5',
      emptyStateCopy:
        'Your digestion pattern needs a few more check-ins before a trend can appear.',
      // No real word scale exists for digestion anywhere in the check-in
      // UI (components/checkin/DriverProbeField.tsx renders it as a bare
      // numbered row) — plain numbers are the honest "same labels she saw."
      levelLabel: (level: number) => String(level),
    },
    {
      key: 'pain',
      label: 'Pain',
      group: 'checkin',
      points: checkinPoints(checkins, 'pain_discomfort_level'),
      min: 0,
      max: 5,
      unit: '/5',
      emptyStateCopy: 'Your pain pattern needs a few more check-ins before a trend can appear.',
      levelLabel: painLabel,
    },
  ];

  const wearableDataPresent = hasWearableData(
    readinessHistory,
    sleepHistory,
    stepsHistory,
    stressHistory
  );

  const sleepValues = sleepHistory.map((m) => m.numeric_value);
  const stepsValues = stepsHistory.map((m) => m.numeric_value);
  const sleepBounds = dynamicBounds(sleepValues);
  const stepsBounds = dynamicBounds(stepsValues);

  const wearableSegments: Segment[] = wearableDataPresent
    ? [
        {
          key: 'readiness',
          label: 'Readiness',
          group: 'wearable',
          points: wearablePoints(readinessHistory),
          min: 0,
          max: 100,
          unit: '',
          emptyStateCopy:
            'Your readiness pattern needs a few more recorded days before a trend can appear.',
        },
        {
          key: 'wearable_sleep',
          label: 'Sleep',
          group: 'wearable',
          points: wearablePoints(sleepHistory),
          min: sleepBounds.min,
          max: sleepBounds.max,
          unit: ' min',
          emptyStateCopy:
            'Your sleep pattern needs a few more recorded days before a trend can appear.',
        },
        {
          key: 'steps',
          label: 'Steps',
          group: 'wearable',
          points: wearablePoints(stepsHistory),
          min: stepsBounds.min,
          max: stepsBounds.max,
          unit: ' steps',
          emptyStateCopy:
            'Your steps pattern needs a few more recorded days before a trend can appear.',
        },
        {
          key: 'wearable_stress',
          label: 'Stress',
          group: 'wearable',
          points: wearablePoints(stressHistory),
          min: 0,
          max: 100,
          unit: '',
          emptyStateCopy:
            'Your wearable stress pattern needs a few more recorded days before a trend can appear.',
        },
      ]
    : [];

  const allSegments = [...checkinSegments, ...wearableSegments];
  const [activeKey, setActiveKey] = useState('energy');
  const active = allSegments.find((s) => s.key === activeKey) ?? checkinSegments[0]!;

  return (
    <section className={`${CARD} mt-5 p-6`}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Trends</p>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#1B3A2D]/40">
          From your check-ins
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {checkinSegments.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={activeKey === s.key}
              onClick={() => setActiveKey(s.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                activeKey === s.key
                  ? 'bg-[#1B3A2D] text-white'
                  : 'bg-[#FAFAF8] text-[#1B3A2D] hover:bg-[#EFF6F1]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {wearableDataPresent && (
          <>
            <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-[#1B3A2D]/40">
              From your wearable
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {wearableSegments.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={activeKey === s.key}
                  aria-label={`${s.label} (from wearable)`}
                  onClick={() => setActiveKey(s.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                    activeKey === s.key
                      ? 'border-[#C4A050] bg-[#C4A050]/15 text-[#1B3A2D]'
                      : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D] hover:bg-[#FAFAF8]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <MetricTrendChart
        points={active.points}
        min={active.min}
        max={active.max}
        unit={active.unit}
        label={active.label}
        emptyStateCopy={active.emptyStateCopy}
        animated
      />

      {active.group === 'checkin' && active.levelLabel && (
        <MetricDistributionCard
          points={active.points}
          min={active.min}
          max={active.max}
          levelLabel={active.levelLabel}
          metricLabel={active.label}
          resetKey={active.key}
        />
      )}
    </section>
  );
}
